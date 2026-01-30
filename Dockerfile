# 1. 选择基础镜像：使用轻量级的 Node.js 18 (Alpine Linux版本)
# 这样打出来的镜像非常小，只有几十 MB
FROM node:18-alpine

# 2. 设置容器内的工作目录
WORKDIR /app

# 3. 复制依赖描述文件
# 为什么先只复制 package.json？为了利用 Docker 缓存。
# 只要依赖没变，下次构建时就会跳过 npm install，速度飞快。
COPY package.json ./

# 4. 安装依赖
# --production 表示只安装运行必须的包 (ws)，不安装开发工具
RUN npm install --production

# 5. 复制核心代码文件
COPY index.js ./

# 6. 设置环境变量默认值 (运行时可以在平台后台覆盖这些值)
ENV PORT=8000
ENV UUID=a2056d0d-c98e-4aeb-9aab-37f64edd5710
ENV PROXYIP=""
ENV SUB_PATH="sub"

# 7. 暴露端口 (告诉 Docker 这个容器会用 8000 端口)
EXPOSE 8000

# 8. 启动命令
CMD ["node", "index.js"]



