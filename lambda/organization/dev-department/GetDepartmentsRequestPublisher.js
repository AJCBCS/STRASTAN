const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const topicArn = process.env.DEPARTMENT_TOPIC_ARN;

exports.handler = async () => {
  const message = {
    action: 'GET_ALL_DEPARTMENTS',
    timestamp: new Date().toISOString(),
  };

  try {
    await snsClient.send(new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message),
    }));

    console.log('📤 Published GET_ALL_DEPARTMENTS request to SNS');

    return {
      statusCode: 202,
      body: JSON.stringify({
        message: 'Department hierarchy aggregation triggered.',
        action: message.action,
        timestamp: message.timestamp,
      }),
    };
  } catch (error) {
    console.error('❌ Failed to publish GET_ALL_DEPARTMENTS:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to trigger department aggregation.',
        error: error.message,
      }),
    };
  }
};