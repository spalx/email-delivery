FROM node:22

WORKDIR /app

COPY ./app/package*.json .

RUN --mount=type=ssh npm install --force --quiet

COPY ./app .
