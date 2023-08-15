import AWS from 'aws-sdk';

const _config = new AWS.Config({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
AWS.config.update({ region: 'us-east-1' });
const client = new AWS.Rekognition();

export const getRekoResults = async (base64Image: string) => {
  const params = {
    Image: {
      Bytes: Buffer.from(base64Image, 'base64'),
    },
  };
  return client.detectText(params).promise();
};
