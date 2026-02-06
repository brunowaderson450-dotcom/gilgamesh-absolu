FROM node:20

# Installation des outils système nécessaires
RUN apt-get update && apt-get install -y ffmpeg git

WORKDIR /app

# On copie le package.json et on installe tout directement
COPY package.json .
RUN npm install --production

# On copie le reste du code
COPY . .

# On lance le bot
CMD ["node", "main.js"]
