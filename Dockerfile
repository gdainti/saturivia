FROM node:20-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 4000

# remove dev for production
CMD ["npm", "run", "start:dev"]
