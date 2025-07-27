FROM node:18-bullseye

# Install system dependencies for canvas and fonts
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    python3-pip \
    python3-setuptools \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-open-sans \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package file
COPY package.json ./

# Install only production dependencies
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

# Copy all application files
COPY . .

# Create fonts directory for Google Fonts
RUN mkdir -p /app/fonts && chmod 755 /app/fonts

# Expose the app port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
