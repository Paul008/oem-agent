FROM apify/actor-node-puppeteer-chrome:22

COPY package*.json ./
RUN npm install --include=dev
COPY . ./

CMD ["npm", "start"]
