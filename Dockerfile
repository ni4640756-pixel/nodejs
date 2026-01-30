# 使用轻量级 Node.js 18 Alpine 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 1. 复制依赖文件
COPY package.json ./

# 2. 安装生产依赖 (ws)
RUN npm install --production

# 3. 复制核心代码
COPY index.js ./

# 设置环境变量默认值
# 平台部署时可以在后台 Environment Variables 覆盖这些值
ENV PORT=8000
ENV UUID=a2056d0d-c98e-4aeb-9aab-37f64edd5710
ENV PROXYIP=""
ENV SUB_PATH="sub"

# 暴露端口 (容器内部端口)
EXPOSE 8000

# 启动命令
CMD ["node", "index.js"]
