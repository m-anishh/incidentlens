FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Inlined into the client bundle at build time.
ARG NEXT_PUBLIC_REPO_URL=""
ENV NEXT_PUBLIC_REPO_URL=$NEXT_PUBLIC_REPO_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# BACKEND_URL is read at request time by the API proxy route, so one image
# works locally and on EC2.
CMD ["npm", "start"]
