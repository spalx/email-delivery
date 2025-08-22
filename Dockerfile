FROM node:24

WORKDIR /app

COPY ./app/package*.json .

RUN npm install --force --quiet

COPY ./app .
