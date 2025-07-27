FROM node:18-alpine

# Install fontconfig and common fonts for canvas text rendering
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    ttf-opensans \
    && fc-cache -fv

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create fonts directory
RUN mkdir -p fonts

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]