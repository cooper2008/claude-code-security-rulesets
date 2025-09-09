# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./

# Install dependencies without running prepare script
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Try to build the project with timeout
RUN timeout 30 npm run build || echo "Build failed or timed out"

# Expose port if needed (for future web interface)  
EXPOSE 3000

# Default command
CMD ["npm", "test"]