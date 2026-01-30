# 使用轻量级的 Node.js 18 Alpine 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 1. 先复制依赖描述文件 (利用 Docker 缓存加速构建)
COPY package.json ./

# 2. 安装生产环境依赖 (只安装 ws)
RUN npm install --production

# 3. 复制核心代码
COPY index.js ./

# 设置环境变量默认值 (运行时可被平台覆盖)
ENV PORT=8000
ENV UUID=a2056d0d-c98e-4aeb-9aab-37f64edd5710

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["node", "index.js"]
