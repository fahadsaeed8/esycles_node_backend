const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/esycles');


const UtilModel = require('./models/Utils');

const Country = UtilModel.Country
const State = UtilModel.State
const City = UtilModel.City
const Language = UtilModel.Language
async function seedDatabase() {
  try {

    // Insert countries
    const usa = await Country.create({
      name: "United States",
      code: "US",
      phone_code: "+1",
      is_active: true
    });

    // Insert states
    const california = await State.create({
      name: "California",
      code: "CA",
      country: usa._id,
      is_active: true
    });

    // Insert cities
    await City.create({
      name: "Los Angeles",
      state: california._id,
      country: usa._id,
      is_active: true
    });

    // Insert languages
    await Language.create([
      { name: "English", code: "en", is_active: true },
      { name: "Spanish", code: "es", is_active: true }
    ]);

    console.log("Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();