# 研数工坊 多用户版 —— 容器化部署
# 用法：
#   docker build -t kaoyan-math .
#   docker run -d -p 3000:3000 -e ADMIN_PASSWORD=你的强密码 -v kaoyan-data:/app/server-data kaoyan-math
FROM node:18-alpine
WORKDIR /app

# 项目零三方依赖，npm install 基本是空操作，保留以便将来扩展
COPY package.json ./
RUN npm install --omit=dev || true

# 复制全部源码与前端静态资源
COPY . .

ENV PORT=3000
EXPOSE 3000

# server.js 会读取 process.env.PORT / ADMIN_USER / ADMIN_PASSWORD
CMD ["node", "server.js"]
