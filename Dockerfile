FROM node:18-alpine

# Install fontconfig, fonts, and build dependencies for canvas
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    ttf-opensans \
    python3 \
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

# Set working directory
WORKDIR /app

# Copy package file
COPY package.json ./

# Install dependencies
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Create fonts directory
RUN mkdir -p fonts

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]