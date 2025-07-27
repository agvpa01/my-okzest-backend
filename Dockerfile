FROM node:18-alpine

# Install fontconfig, fonts, and build dependencies for canvas
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    ttf-opensans \
    python3 \
    py3-pip \
    py3-setuptools \
    py3-wheel \
    py3-distutils \
    make \
    g++ \
    pkgconfig \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libc6-compat \
    && fc-cache -fv

WORKDIR /app

COPY package.json ./

RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

COPY . .

RUN mkdir -p fonts

EXPOSE 3001

CMD ["npm", "start"]
