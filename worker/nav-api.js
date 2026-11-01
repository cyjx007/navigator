/**
 * nav-api —— 导航站的同步接口（Cloudflare Worker + KV）
 *
 * 路由
 *   GET  /api/data        读取整份数据（需要 Authorization: Bearer <NAV_TOKEN>）
 *   POST /api/data        写入整份数据（同上）
 *   GET  /icon?u=host     站点图标代理（免鉴权，KV 缓存 30 天）
 *   GET  /api/health      健康检查，顺便告诉你有没有开鉴权
 *
 * 环境变量（Settings → Variables and Secrets）
 *   NAV_DATA   KV 绑定，必填
 *   NAV_TOKEN  Secret，强烈建议设置；不设置时退回旧的「谁都能读写」模式
 *   ALLOWED_ORIGIN  可选，填站点域名（如 https://navigator.9034999.workers.dev）
 *                   不填则 CORS 放开为 *（有 Token 兜底，风险可控）
 *
 * 多用户 / 多份数据
 *   数据键 = data:<sha256(token) 的前 8 字节>
 *   —— 不同 Token 各存各的，同一个 Token 的多台设备共用一份。
 *   升级前的老数据存在键 data 上，第一次 GET 时自动回退读取，POST 后自然迁移。
 */

const MAX_BODY = 2 * 1024 * 1024; // 导航数据正常只有几十 KB，2MB 兜底防滥用
const ICON_TTL = 60 * 60 * 24 * 30; // 图标缓存 30 天
const ICON_MAX = 200 * 1024;

const DEFAULT_DATA = JSON.stringify({
  categories: [{ id: 1, name: '常用网站', icon: '', order: 1 }],
  links: [],
  meta: { version: 1, lastUpdate: new Date().toISOString() },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, auth: !!env.NAV_TOKEN, kv: !!env.NAV_DATA }, 200, cors);
    }

    if (url.pathname === '/api/data') {
      return handleData(request, env, cors);
    }

    if (url.pathname === '/api/data/prev') {
      return handlePrev(request, env, cors);
    }

    if (url.pathname === '/icon') {
      return handleIcon(url, env, cors);
    }

    return new Response('Not Found', { status: 404, headers: cors });
  },
};

// ===== 数据读写 =====
// 并发控制：KV 里给数据键挂 metadata { rev, updatedAt }，每次写入 rev + 1。
// 客户端上传时带 If-Match: <rev>，对不上就返回 409，前端弹窗让用户决定。
// 写入前把旧值备份到 <key>:prev，误覆盖还能捞回来。
async function handleData(request, env, cors) {
  if (!env.NAV_DATA) {
    return json({ error: 'KV 未绑定：请在 Worker 设置里添加 NAV_DATA' }, 500, cors);
  }

  // 没配 NAV_TOKEN 时保持旧行为，避免升级 Worker 但没设 secret 就把自己锁在外面
  const token = getToken(request);
  if (env.NAV_TOKEN && !timingSafeEqual(token, env.NAV_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  const key = env.NAV_TOKEN ? `data:${await spaceId(token)}` : 'data';

  if (request.method === 'GET') {
    let { value, metadata } = await env.NAV_DATA.getWithMetadata(key);

    if (value === null && env.NAV_TOKEN) {
      // 兼容升级前的老键
      const legacy = await env.NAV_DATA.getWithMetadata('data');
      value = legacy.value;
      metadata = legacy.metadata;
    }

    const rev = String((metadata && metadata.rev) || 0);
    const updatedAt = (metadata && metadata.updatedAt) || null;

    return new Response(value === null ? DEFAULT_DATA : value, {
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Data-Rev': rev,
        'X-Data-Updated': updatedAt || '',
      },
    });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    if (body.length > MAX_BODY) {
      return json({ error: 'Payload too large' }, 413, cors);
    }
    try {
      JSON.parse(body);
    } catch (e) {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const current = await env.NAV_DATA.getWithMetadata(key);
    const curRev = Number((current.metadata && current.metadata.rev) || 0);
    const ifMatch = request.headers.get('If-Match');

    // 带版本号且对不上 = 别人先改过，拒绝写入
    if (ifMatch !== null && ifMatch !== '' && Number(ifMatch) !== curRev) {
      return json({
        error: 'conflict',
        rev: curRev,
        updatedAt: (current.metadata && current.metadata.updatedAt) || null,
      }, 409, cors);
    }

    // 备份上一版（只在有内容时）
    if (current.value !== null && current.value !== undefined) {
      await env.NAV_DATA.put(`${key}:prev`, current.value, {
        metadata: {
          rev: curRev,
          updatedAt: (current.metadata && current.metadata.updatedAt) || null,
          savedAt: new Date().toISOString(),
        },
      });
    }

    const rev = curRev + 1;
    const updatedAt = new Date().toISOString();
    await env.NAV_DATA.put(key, body, { metadata: { rev, updatedAt } });

    return new Response(JSON.stringify({
      ok: true,
      space: key.replace(/^data:/, ''),
      bytes: body.length,
      rev,
      updatedAt,
    }), {
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Data-Rev': String(rev),
        'X-Data-Updated': updatedAt,
      },
    });
  }

  return json({ error: 'Method Not Allowed' }, 405, cors);
}

// ===== 上一版数据（每次上传前的自动备份）=====
async function handlePrev(request, env, cors) {
  if (!env.NAV_DATA) {
    return json({ error: 'KV 未绑定' }, 500, cors);
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, 405, cors);
  }

  const token = getToken(request);
  if (env.NAV_TOKEN && !timingSafeEqual(token, env.NAV_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  const key = env.NAV_TOKEN ? `data:${await spaceId(token)}` : 'data';
  const prev = await env.NAV_DATA.getWithMetadata(`${key}:prev`);

  if (!prev.value) {
    return json({ error: 'No previous version' }, 404, cors);
  }

  let data = null;
  try {
    data = JSON.parse(prev.value);
  } catch (e) {
    return json({ error: 'Previous version corrupted' }, 500, cors);
  }

  return json({
    data,
    savedAt: (prev.metadata && prev.metadata.savedAt) || null,
    rev: (prev.metadata && prev.metadata.rev) || 0,
    updatedAt: (prev.metadata && prev.metadata.updatedAt) || null,
  }, 200, cors);
}

// ===== 图标代理 =====
// 站点自己的 /icon?u=example.com —— 浏览器只跟同源（或你配置的 Worker）打交道，
// 国内网络下也不会出现「一排空白图标」。
async function handleIcon(url, env, cors) {
  const host = normalizeHost(url.searchParams.get('u'));
  if (!host) {
    return new Response('Bad host', { status: 400, headers: cors });
  }

  const cacheKey = `icon:${host}`;
  if (env.NAV_DATA) {
    const cached = await env.NAV_DATA.get(cacheKey, 'arrayBuffer');
    if (cached && cached.byteLength) {
      return iconResponse(cached, cors);
    }
  }

  // 只向固定的公共图标服务取图，不直连 u 指定的站点——
  // 否则这个接口会被当成 SSRF 跳板去打内网地址
  const sources = [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src, { cf: { cacheTtl: 86400 } });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > ICON_MAX) continue;
      if (env.NAV_DATA) {
        await env.NAV_DATA.put(cacheKey, buf, { expirationTtl: ICON_TTL });
      }
      return iconResponse(buf, cors);
    } catch (e) {
      // 换下一个源
    }
  }

  return new Response('', { status: 404, headers: cors });
}

function iconResponse(buf, cors) {
  return new Response(buf, {
    headers: {
      ...cors,
      'Content-Type': sniffImageType(buf),
      'Cache-Control': `public, max-age=${ICON_TTL}, immutable`,
    },
  });
}

function sniffImageType(buf) {
  const b = new Uint8Array(buf.slice(0, 8));
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01) return 'image/x-icon';
  if (b[0] === 0x3c) return 'image/svg+xml';
  return 'image/x-icon';
}

function normalizeHost(raw) {
  if (!raw) return '';
  const host = String(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0];
  if (!host || host.length > 253) return '';
  // 只允许域名：挡掉 IP、localhost 之类的内网探测
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return '';
  if (/(^|\.)(localhost|local|internal|localdomain)$/.test(host)) return '';
  return host;
}

// ===== 小工具 =====
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function corsHeaders(env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // If-Match 用于乐观锁，属于非简单头，必须显式放行，否则预检不过
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-Match',
    'Access-Control-Expose-Headers': 'X-Data-Rev, X-Data-Updated',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
}

function getToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// 定长比较，避免用 === 泄露长度信息
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Token → 数据分区，避免把 token 本身写进 KV 键
async function spaceId(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
