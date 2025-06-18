/* 1st Version of the code

import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.CONTACTS_TABLE!;

export const handler = async (event: any) => {
  //Check Authorization header
  //const authHeader = event.headers?.Authorization || event.headers?.authorization;
  //if (!authHeader || authHeader !== 'Bearer 123') {
  //  return {
  //    statusCode: 403,
  //    body: JSON.stringify({ error: 'Forbidden: Invalid token' }),
  //  };
  //}


  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body);
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing fields' }),
      };
    }

    const params = {
      TableName: TABLE_NAME,
      Item: {
        id: { S: Date.now().toString() },
        name: { S: name },
        email: { S: email },
        message: { S: message },
      },
    };

    await client.send(new PutItemCommand(params));

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Contact saved' }),
    };
  } else if (event.httpMethod === 'GET') {
    const params = {
      TableName: TABLE_NAME,
    };

    const data = await client.send(new ScanCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify(data.Items),
    };
  } else {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not Found' }),
    };
  }
};

*/




import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import * as crypto from 'crypto';


const client = new DynamoDBClient({});
const TABLE_NAME = process.env.CONTACTS_TABLE!;

const userPoolId = 'ap-northeast-1_GXbk8PlT6';
const clientId = '1eruvkbn4lfj95bch28bb14n3o';


// Add encryption functions
const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', 
    Buffer.from(process.env.ENCRYPTION_KEY!), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedText: string): string => {
  const [ivHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', 
    Buffer.from(process.env.ENCRYPTION_KEY!), iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

//Cognito JWT Verifier
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: 'id', 
});

export const handler = async (event: any) => {
  try {
    // Extract the Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid Authorization header' }),
      };
    }

    const token = authHeader.split(' ')[1]; // Extracts the token from the header

    // Verify the token
    const payload = await verifier.verify(token);

    console.log('Token is valid. Payload:', payload);

    // Proceed with your logic
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { name, email, message } = body;

      if (!name || !email || !message) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing fields' }),
        };
      }

      const params = {
        TableName: TABLE_NAME,
        Item: {
          id: { S: Date.now().toString() },
          name: { S: encrypt(name) },
          email: { S: encrypt(email) },
          message: { S: encrypt(message) },
        },
      };

      await client.send(new PutItemCommand(params));

      return {
        statusCode: 201,
        body: JSON.stringify({ message: 'Contact saved' }),
      };


    } else if (event.httpMethod === 'GET') {
      const params = {
        TableName: TABLE_NAME,
      };

      console.log('Fetching data from DynamoDB...');
      const data = await client.send(new ScanCommand(params));
    console.log('Retrieved items:', JSON.stringify(data.Items));

    // Add error handling for decryption
    const decryptedItems = data.Items?.map(item => {
      try {
        console.log('Attempting to decrypt item:', item.id.S);
        return {
          id: item.id.S,
          name: decrypt(item.name.S!),
          email: decrypt(item.email.S!),
          message: decrypt(item.message.S!)
        };
      } catch (decryptError) {
        console.error('Error decrypting item:', item.id.S, decryptError);
        return null;
      }
    }).filter(item => item !== null) || [];

    console.log('Successfully decrypted items:', decryptedItems.length);

      return {
        statusCode: 200,
        headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
      },
        body: JSON.stringify(decryptedItems),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Not Found' }),
      };
    }
  } catch (err) {
    console.error('Error verifying token:', err);
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Forbidden: Invalid token' }),
    };
  }

  



};
