# 使用轻量级的 Nginx 镜像
FROM nginx:alpine

# 移除 Nginx 默认的静态文件
RUN rm -rf /usr/share/nginx/html/*

# 复制你的网站文件到 Nginx 目录
COPY . /usr/share/nginx/html/

# 复制自定义的 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口（Railway 会通过 PORT 环境变量来覆盖）
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
