FROM ubuntu-latest

#init system user to isolate it from the OS
RUN addgroup sysgroup && adduser -S -G sysgroup system
USER system

#import the project
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . . 

#expose the project's endport
EXPOSE 3001 

#start the project
CMD ["npm", "start"]