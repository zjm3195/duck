# 用火山引擎（抖音官方）国内镜像源，100%能拉取
FROM public-cn-beijing.cr.volces.com/public/base:node-18-alpine

# 设置工作目录
WORKDIR /app

# 复制项目文件到容器内
COPY . .

# 用国内npm源安装依赖，避免超时
RUN npm install --registry=https://registry.npmmirror.com

# 暴露服务端口（和你的server.js监听端口一致，默认是8080）
EXPOSE 8080

# 启动服务，直接运行你的入口文件
CMD ["node", "server.js"]
