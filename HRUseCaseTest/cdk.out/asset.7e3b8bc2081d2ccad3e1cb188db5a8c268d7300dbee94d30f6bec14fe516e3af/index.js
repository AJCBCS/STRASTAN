// lambda/organization/dev-position/getPosition.js
exports.handler = async (event) => {
  console.log("getPosition Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Gets position details" })
  };
};
