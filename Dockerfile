FROM node:18-alpine

# Install system dependencies for canvas
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Update browserslist database
RUN npx update-browserslist-db@latest

# Copy source code
COPY . .

# Build the application
ENV CI=false
ENV DISABLE_BROWSERSLIST_UPDATE_CHECK=true
ENV NODE_OPTIONS=--max_old_space_size=4096

RUN yarn build

# Use nginx to serve static files
FROM nginx:alpine
COPY --from=0 /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]