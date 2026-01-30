/**
 * Node.js VLESS Server
 * 运行命令: node index.js
 */

const http = require('http');
const net = require('net');
const { WebSocketServer } = require('ws');
const { TextDecoder } = require('util');

// --- 1. 全局配置 ---
const PORT = process.env.PORT || 8000;
const UUID = process.env.UUID || "a2056d0d-c98e-4aeb-9aab-37f64edd5710";
const PROXY_IP = process.env.PROXYIP || ""; // 想要转发的优选IP (可选)
const SUB_PATH = process.env.SUB_PATH || "sub"; // 订阅路径

console.log(`Node.js VLESS Server Running...`);
console.log(`UUID: ${UUID}`);
console.log(`Port: ${PORT}`);

// --- 2. 核心逻辑函数 ---

/**
 * 解析 VLESS 协议头部
 * @param {Buffer} buffer 
 */
function parseVlessHeader(buffer) {
    if (buffer.length < 24) {
        return { hasError: true, msg: "Data too short" };
    }
    
    const version = buffer[0];
    const optLen = buffer[17];
    const cmd = buffer[18 + optLen]; // 1=TCP, 2=UDP

    if (cmd !== 1) {
        return { hasError: true, msg: `Unsupported CMD: ${cmd} (Only TCP)` };
    }

    const portIdx = 19 + optLen;
    const port = (buffer[portIdx] << 8) | buffer[portIdx + 1];

    let addrIdx = portIdx + 2;
    const addrType = buffer[addrIdx];
    let hostname = "";
    let rawIndex = 0;

    if (addrType === 1) { // IPv4
        hostname = buffer.subarray(addrIdx + 1, addrIdx + 5).join(".");
        rawIndex = addrIdx + 5;
    } else if (addrType === 2) { // Domain
        const len = buffer[addrIdx + 1];
        hostname = new TextDecoder().decode(buffer.subarray(addrIdx + 2, addrIdx + 2 + len));
        rawIndex = addrIdx + 2 + len;
    } else if (addrType === 3) { // IPv6
        // Node.js 简化处理 IPv6
        return { hasError: true, msg: "IPv6 not supported in this lite version" };
    } else {
        return { hasError: true, msg: `Unknown address type: ${addrType}` };
    }

    return { hasError: false, port, hostname, rawIndex, version };
}

/**
 * 处理 WebSocket 连接
 * @param {WebSocket} ws 
 */
function handleVlessConnection(ws) {
    let isHeaderParsed = false;
    let remoteConnection = null;

    console.log("[WS] Connected");

    ws.on('message', (msg) => {
        const chunk = Buffer.from(msg);

        // 1. 如果已经建立了连接，直接转发数据
        if (remoteConnection) {
            // 确保连接可写
            if (!remoteConnection.destroyed && remoteConnection.writable) {
                remoteConnection.write(chunk);
            }
            return;
        }

        // 2. 第一次收到数据，解析 VLESS 头部
        if (!isHeaderParsed) {
            const res = parseVlessHeader(chunk);
            if (res.hasError) {
                console.error(`[Header Error] ${res.msg}`);
                ws.close();
                return;
            }

            isHeaderParsed = true;
            // 如果设置了 PROXYIP 环境变量，则强制转发到该 IP
            const targetHost = PROXY_IP || res.hostname;
            const targetPort = res.port;

            console.log(`[Connecting] ${res.hostname}:${res.port} -> ${targetHost}`);

            // 建立 TCP 连接
            remoteConnection = net.createConnection(targetPort, targetHost, () => {
                // 连接成功
                // VLESS 响应：成功建立连接 (Version + 0)
                const header = Buffer.alloc(2);
                header[0] = res.version;
                header[1] = 0;
                ws.send(header);

                // 将头部携带的多余数据发给远程
                if (chunk.length > res.rawIndex) {
                    remoteConnection.write(chunk.subarray(res.rawIndex));
                }
            });

            // 绑定远程数据事件 (将远程数据转发回 WS)
            remoteConnection.on('data', (data) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(data);
                }
            });

            remoteConnection.on('error', (e) => {
                console.error(`[Connect Failed] ${targetHost}:${targetPort} - ${e.message}`);
                ws.close();
            });

            remoteConnection.on('close', () => {
                ws.close();
            });
            
            remoteConnection.on('timeout', () => {
                remoteConnection.destroy();
                ws.close();
            });
        }
    });

    ws.on('close', () => {
        console.log("[WS] Closed");
        if (remoteConnection) {
            remoteConnection.destroy();
        }
    });

    ws.on('error', (e) => {
        console.error("[WS] Error:", e);
        if (remoteConnection) {
            remoteConnection.destroy();
        }
    });
}

// --- 3. 启动 Web 服务 ---

const server = http.createServer((req, res) => {
    // 构造 URL 对象方便解析
    const baseURL = 'http://' + req.headers.host;
    const url = new URL(req.url, baseURL);

    // 情况 B: 获取订阅链接
    if (url.pathname === `/${SUB_PATH}`) {
        const host = req.headers.host || "localhost";
        // 生成 V2RayN 格式的订阅链接
        // 格式: vless://UUID@HOST:443?security=tls&type=ws&host=HOST&path=/#Name
        // 注意：Node 环境下通常前面有反代(Nginx)负责 TLS，或者这里是 HTTP 模式，根据实际情况修改 security
        const vlessLink = `vless://${UUID}@${host}:80?encryption=none&security=none&type=ws&host=${host}&path=%2F#Node-${host.split('.')[0]}`;
        
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(Buffer.from(vlessLink).toString('base64'));
        return;
    }

    // 情况 C: 默认首页
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Node.js VLESS Server is Running.\nUUID: ${UUID}`);
});

// 创建 WebSocket 服务器 (挂载在 HTTP 服务上)
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    // 可以在这里判断路径，例如只允许根路径升级
    // if (request.url !== '/') { socket.destroy(); return; }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws) => {
    handleVlessConnection(ws);
});

// 启动监听
server.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
});
