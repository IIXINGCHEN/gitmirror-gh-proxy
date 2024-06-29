'use strict'

/**
 * static files (404.html, sw.js, conf.js)
 */
const ASSET_URL = 'https://crazypeace.github.io/gh-proxy/'
// 前缀，如果自定义路由为example.com/gh/*，将PREFIX改为 '/gh/'，注意，少一个杠都会错！
const PREFIX = '/'
// 分支文件使用jsDelivr镜像的开关，0为关闭，默认关闭
const Config = {
    jsdelivr: 0
}

const whiteList = [] // 白名单，路径里面有包含字符的才会通过，e.g. ['/username/']

/** @type {RequestInit} */
// 定义允许的方法数组
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'TRACE', 'DELETE', 'HEAD', 'OPTIONS'];
// 使用ALLOWED_METHODS数组来设置PREFLIGHT_INIT的响应头
const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': ALLOWED_METHODS.join(','),
        'access-control-max-age': '1728000',
    }),
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i
const exp7 = /^(?:https?:\/\/)?api\.github\.com\/.*$/i
const exp8 = /^(?:https?:\/\/)?git\.io\/.*$/i

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
function makeRes(body, status = 200, headers = {}) {
    // 如果headers中没有access-control-allow-origin，则添加它
    if (!headers.hasOwnProperty('access-control-allow-origin')) {
        headers['access-control-allow-origin'] = '*';
    }
    // 这里可以添加对body的检查或转换逻辑，但根据上下文，我们假设body是可以直接使用的
    // 例如，如果body是对象，你可能需要将其转换为JSON字符串
    return new Response(body, {status, headers});
}
/**
 * @param {string} urlStr
 */

function newUrl(urlStr) {
    try {
        return new URL(urlStr);
    } catch (err) {
        console.error("Error creating URL:", err);
        return { error: err.message }; // 返回错误信息对象
    }
}

// 调用时，需要检查返回值是否为URL对象
// 例如：
// const urlObj = newUrl(someString);
// if (urlObj instanceof URL) {
//     // 是有效的URL对象，可以安全使用
// } else {
//     // urlObj 是包含错误信息的对象，需要进行处理
// }

addEventListener('fetch', e => {
    fetchHandler(e)
        .then(ret => e.respondWith(ret))
        .catch(err => {
            console.error("Fetch error handler:", err);
            e.respondWith(makeRes('cfworker error:\n' + err.stack, 502));
        });
})

function checkUrl(u) {
    // 使用 some 方法结合正则表达式的 test 方法来检查 URL 是否与任何一个正则表达式匹配
    return [exp1, exp2, exp3, exp4, exp5, exp6, exp7, exp8].some(exp => exp.test(u));
}
/**
 * @param {FetchEvent} e
 */
async function fetchHandler(e) {
    const req = e.request;
    const urlStr = req.url;
    const urlObj = new URL(urlStr);

    console.log("in:", urlStr);

    let path = urlObj.searchParams.get('q');
    if (path) {
        return Response.redirect('https://' + urlObj.host + PREFIX + path, 301);
    }

    path = urlObj.pathname + urlObj.search + urlObj.hash; // 完整路径
    console.log("path:", path);

    // 去除嵌套路径
    const expRemovePrefix = new RegExp(`^${urlObj.origin}${PREFIX}`, 'i');
    while (expRemovePrefix.test(path)) {
        path = path.replace(expRemovePrefix, '');
    }
    path = path.replace(/^https?:\/+/, 'https://'); // 确保协议正确
    console.log("processed path:", path);

    // 提前定义处理函数
    const handleJsDelivrRedirect = (path) => {
        if (Config.jsdelivr) {
            return path.replace('/blob/', '@').replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh');
        }
        return path.replace('/blob/', '/raw/');
    };

    // 模式匹配与处理
    if (matchesPattern(path, [exp1, exp3, exp4, exp5, exp6, exp7, exp8])) {
        return httpHandler(req, path);
    } else if (matchesPattern(path, [exp2])) {
        return Response.redirect(handleJsDelivrRedirect(path), 302);
    } else if (path === 'perl-pe-para') {
        // 修正拼写错误
        let responseText = // ...;
        return new Response(responseText, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'max-age=300'
            }
        });
    } else {
        console.log("fetch", ASSET_URL + path);
        return fetch(ASSET_URL + path).catch((err) => {
            // 添加错误处理
            console.error("Fetch error:", err);
            return makeRes('cfworker error:\n' + err.stack, 502);
        });
    }
}

// 辅助函数，检查path是否匹配任何给定的正则表达式
function matchesPattern(path, patterns) {
    for (let i of patterns) {
        if (path.search(i) === 0) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Request} req
 * @param {string} pathname
 */

function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers;

    // preflight
    if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT);
    }

    const reqHdrNew = new Headers(reqHdrRaw);

    // 检查白名单，如果白名单不为空，则只有包含白名单路径的请求才会被允许
    if (whiteList.length > 0 && !whiteList.some(item => pathname.includes(item))) {
        return new Response("blocked", { status: 403 });
    }

    // 检查是否已经是完整的URL，如果不是且以'git'开头，则添加协议前缀
    if (!/^https?:\/\//.test(pathname) && pathname.startsWith('git')) {
        pathname = 'https://' + pathname;
    }

    const urlObj = newUrl(pathname);
    if (!urlObj) {
        // 如果无法解析为URL，则返回错误响应
        return new Response("Invalid URL", { status: 400 });
    }

    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body
    };
    return proxy(urlObj, reqInit);
}

/**
 *
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 */
async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit);
    
    // 只创建一次Headers对象，后续修改
    const resHdrNew = new Headers(res.headers);
    
    const status = res.status;

    if (resHdrNew.has('location')) {
        let _location = resHdrNew.get('location');
        // 先检查新URL是否有效
        const newLocationUrl = newUrl(_location);
        if (!newLocationUrl) {
            return new Response('Invalid redirect location', { status: 502 });
        }
        if (checkUrl(newLocationUrl.href)) {
            // 只在确认新URL有效且符合规则时才修改location头
            resHdrNew.set('location', PREFIX + newLocationUrl.href);
        } else {
            // 如果新URL不符合规则，则设置redirect为follow，并递归调用
            reqInit.redirect = 'follow';
            return proxy(newLocationUrl, reqInit);
        }
    }
    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');
    return new Response(res.body, {
        status,
        headers: resHdrNew,
    });
}
