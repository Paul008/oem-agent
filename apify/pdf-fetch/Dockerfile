FROM apify/actor-node:22

COPY package*.json ./
RUN npm install --include=dev
COPY . ./

CMD ["npm", "start"]
