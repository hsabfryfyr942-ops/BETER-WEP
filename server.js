
/*
 * HardHub Gemini API Proxy
 * Requires Node.js 18+
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || 'localhost';

// Load environment variables from .env
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const content = fs.readFileSync(envPath, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(
        /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/
      );

      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(
          /^['"]|['"]$/g,
          ''
        );
      }
    }
  } catch (error) {
    // .env is optional
  }
}

loadEnv();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

const SYSTEM_PROMPT = `
أنت مساعد تعليمي عربي لمنصة HardHub.
أجب بلغة بسيطة وواضحة، وادعم العربية والإنجليزية
بحسب لغة المستخدم.

ركز على عتاد الحاسوب، مثل:
CPU وGPU وRAM والتخزين واللوحة الأم
ومزود الطاقة والتبريد وأجهزة الإدخال والإخراج.

إذا كان السؤال خارج نطاق عتاد الحاسوب،
اشرح بلطف أن نطاق المنصة هو العتاد.

لا تدّع أن الإجابة مأخوذة من كتاب معين
ما لم يزوّدك المستخدم بنص الكتاب.
`;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = '';
  let size = 0;
  const maxSize = 1024 * 1024;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > maxSize) {
      throw new Error('حجم الطلب أكبر من الحد المسموح.');
    }

    raw += chunk.toString('utf8');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('صيغة JSON للطلب غير صحيحة.');
  }
}

async function handleGemini(req, res) {
  let body;

  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message
    });
  }

  const apiKey = String(
    body.apiKey || process.env.GEMINI_API_KEY || ''
  ).trim();

  if (!apiKey) {
    return sendJson(res, 503, {
      error:
        'أدخل Gemini API Key في صفحة المساعد أو أضفه إلى ملف .env.'
    });
  }

  const prompt = String(body.prompt || '').trim();

  if (!prompt) {
    return sendJson(res, 400, {
      error: 'اكتب سؤالك أولاً.'
    });
  }

  // Try the configured model first, then stable fallback models if the service
  // is temporarily overloaded or the selected model is unavailable.
  const configuredModel = String(
    process.env.GEMINI_MODEL || 'gemini-3.8-flash'
  ).trim();
  const models = [...new Set([
    configuredModel,
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite'
  ])];

  let lastMessage = '';
  let lastStatus = 502;

  for (const model of models) {
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent';

    // Brief retries for temporary overload/rate-limit responses.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(
          endpoint + '?key=' + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT }]
              },
              contents: [
                {
                  role: 'user',
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                maxOutputTokens: 900
              }
            }),
            signal: AbortSignal.timeout(60000)
          }
        );

        const data = await upstream.json().catch(() => ({}));

        if (!upstream.ok) {
          lastStatus = upstream.status;
          lastMessage = data?.error?.message ||
            'Gemini API returned HTTP ' + upstream.status;

          const invalidApiKey = [400, 401, 403].includes(upstream.status) &&
            /API[_ ]KEY_INVALID|API key.*(?:not valid|invalid|expired|disabled)|invalid API key/i.test(lastMessage);
          if (invalidApiKey) {
            return sendJson(res, 401, {
              code: 'INVALID_API_KEY',
              error: 'مفتاح Gemini API غير صالح أو لا يملك صلاحية الوصول.'
            });
          }

          // Only retry/fallback for overload, rate limits, or model issues.
          if ([429, 500, 502, 503, 504, 404].includes(upstream.status)) {
            if (attempt === 0 && [429, 500, 502, 503, 504].includes(upstream.status)) {
              await new Promise(resolve => setTimeout(resolve, 1200));
              continue;
            }
            break;
          }

          return sendJson(res, 502, {
            error: 'تعذر الحصول على رد من Gemini: ' + lastMessage
          });
        }

        const answer = data.candidates?.[0]?.content?.parts
          ?.map(part => part.text || '')
          .join('\n')
          .trim();

        if (answer) {
          return sendJson(res, 200, {
            text: answer,
            model
          });
        }

        lastMessage = 'لم يصل رد نصي من النموذج ' + model;
        lastStatus = 502;
        break;
      } catch (error) {
        lastMessage = error.name === 'TimeoutError'
          ? 'انتهت مهلة الاتصال.'
          : error.message;
        lastStatus = 502;
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          continue;
        }
      }
    }
  }

  const overload = [429, 500, 502, 503, 504].includes(lastStatus) ||
    /high demand|overload|temporarily unavailable|try again later/i.test(lastMessage);

  return sendJson(res, 502, {
    error: overload
      ? 'خدمة Gemini مشغولة حاليًا. جرّب مرة ثانية بعد دقيقة؛ تمّت تجربة أكثر من نموذج تلقائيًا.'
      : 'تعذر الحصول على رد من Gemini: ' + lastMessage
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Gemini API endpoint
  if (
    req.method === 'POST' &&
    url.pathname === '/api/gemini'
  ) {
    return handleGemini(req, res);
  }

  // Basic health endpoint
  if (
    req.method === 'GET' &&
    url.pathname === '/api/health'
  ) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'HardHub'
    });
  }

  // Serve website files
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Allow': 'GET, HEAD, POST'
    });

    return res.end('Method Not Allowed');
  }

  let pathname;

  try {
    pathname = decodeURIComponent(
      url.pathname === '/' ? '/index.html' : url.pathname
    );
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  const root = path.resolve(__dirname);
  const file = path.resolve(root, '.' + pathname);

  if (
    file !== root &&
    !file.startsWith(root + path.sep)
  ) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });

      return res.end('Not found');
    }

    res.writeHead(200, {
      'Content-Type':
        mime[path.extname(file).toLowerCase()] ||
        'application/octet-stream'
    });

    if (req.method === 'HEAD') {
      return res.end();
    }

    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `HardHub running at http://${HOST}:${PORT}`
  );
});
