FROM public-cn-beijing.cr.volces.com/public/base:node-16-alpine

WORKDIR /app

COPY . .

RUN npm install --registry=https://registry.npmmirror.com

EXPOSE 8080

CMD ["node", "server.js"]
