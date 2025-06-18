/*1st Version of the code
import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class AisaacAbiganCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const contactsTable = new Table(this, 'ContactsTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: 'Contacts',
    });

    // Lambda Function for handling contacts
    const contactHandler = new NodejsFunction(this, 'ContactHandler', {
      entry: 'lambda/contacts.ts',
      handler: 'handler',
      environment: {
        CONTACTS_TABLE: contactsTable.tableName,
      },
      bundling: {
        nodeModules: ['@aws-sdk/client-dynamodb'],  
        externalModules: ['aws-sdk'], 
      },
    });

    // Grants the Lambda function permissions to read/write to the DynamoDB table
    contactsTable.grantReadWriteData(contactHandler);

    // API Gateway
    new LambdaRestApi(this, 'ContactsApi', {
      handler: contactHandler,
    });

    





  }
}
  */

import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class AisaacAbiganCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 🔹 DynamoDB Table
    const contactsTable = new Table(this, 'ContactsTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: 'Contacts',
    });

    // 🔹 Lambda Function
    const contactHandler = new NodejsFunction(this, 'ContactHandler', {
      entry: 'lambda/contacts.ts',
      handler: 'handler',
      environment: {
        CONTACTS_TABLE: contactsTable.tableName,
        ENCRYPTION_KEY: 'TIdlLAwywBPOa38Z/l/LWDgJD/b9tYJf', // 32-byte key
      },
      bundling: {
        nodeModules: ['@aws-sdk/client-dynamodb'],
        externalModules: ['aws-sdk'],
      },
    });

    contactsTable.grantReadWriteData(contactHandler);

    // 🔹 Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });

    // 🔹 Cognito App Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      oAuth: {
    flows: {
      implicitCodeGrant: true,
    },
    scopes: [cognito.OAuthScope.OPENID],
  },
    });

    // 🔹 API Gateway Authorizer using Cognito
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // 🔹 API Gateway Setup
    const api = new apigateway.RestApi(this, 'ContactsApi', {
      restApiName: 'Contacts API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    const contacts = api.root.addResource('contacts');
    contacts.addMethod('GET', new apigateway.LambdaIntegration(contactHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    contacts.addMethod('POST', new apigateway.LambdaIntegration(contactHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

  }
}
