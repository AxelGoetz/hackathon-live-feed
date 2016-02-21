# hackathon-live-feed
A web application for a live feed on a hackathon

## Setting up
`cd` to the project folder and run
```
brew install node
npm install
```

### Setting up keys
Create a keys.js file in the project folder and add the following:
```
module.exports = {
  twitter: {
    consumer_key: 'xx',
    consumer_secret: 'xx',
    access_token: 'xx',
    access_token_secret: 'xx'
  },
  instagram: {
    client_id: 'xx',
    client_secret: 'xx'
  }
};
```

## Running the application
In the project folder run the following command
``` 
npm run
```


