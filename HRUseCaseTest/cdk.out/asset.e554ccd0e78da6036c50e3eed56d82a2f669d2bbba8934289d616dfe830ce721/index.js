// lambda/organization/dev-department/getDepartmentsRequestPublisher.js
var { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
var snsClient = new SNSClient({ region: process.env.AWS_REGION });
var topicArn = process.env.DEPARTMENT_TOPIC_ARN;
exports.handler = async () => {
  const message = {
    action: "GET_ALL_DEPARTMENTS",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message)
    }));
    console.log("\u{1F4E4} Published GET_ALL_DEPARTMENTS request to SNS");
    return {
      statusCode: 202,
      body: JSON.stringify({
        message: "Department hierarchy aggregation triggered.",
        action: message.action,
        timestamp: message.timestamp
      })
    };
  } catch (error) {
    console.error("\u274C Failed to publish GET_ALL_DEPARTMENTS:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to trigger department aggregation.",
        error: error.message
      })
    };
  }
};
