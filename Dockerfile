FROM public-cn-beijing.cr.volces.com/public/base:node-16-alpine

WORKDIR /opt/application/

COPY . .

RUN npm install --registry=https://registry.npmmirror.com

EXPOSE 8080

CMD ["sh", "/opt/application/run.sh"]
