require('dotenv').config();

module.exports = {
  VONAGE_APPLICATION_ID: process.env.VONAGE_APPLICATION_ID,
  VONAGE_PRIVATE_KEY64: process.env.VONAGE_PRIVATE_KEY64,
  VONAGE_API_KEY: process.env.VONAGE_API_KEY,
  VONAGE_API_SECRET: process.env.VONAGE_API_SECRET,
  LVN_A: process.env.LVN_A,
  LVN_B: process.env.LVN_B,
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL,
  DEFAULT_HCP_NUMBER: process.env.DEFAULT_HCP_NUMBER || '',
  DEFAULT_PATIENT_NUMBER: process.env.DEFAULT_PATIENT_NUMBER || '',
};
