import mongoose from 'mongoose';
import { Telegraf, Context } from 'telegraf';
import { UserEntry } from './models/Entry.js';
import { formatTime, getUsername } from './utils.js';

interface UserEntry {
  hours: number;
  minutes: number;
  seconds: number;
  kcal: number;
  distance: number;
}

mongoose.connect(
  'mongodb+srv://bot:s2jZjusORSefqUzC@main.us253pi.mongodb.net/',
  {}
);

const db = mongoose.connection;
const bot = new Telegraf('6442582463:AAHz1pHvovvPjIBpqR6s0N-JdZc6z3ll7xU');

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running...');
});

bot.command('ringfit', async (ctx: Context) => {
  // @ts-ignore
  const inputText = ctx.message?.text;
  const replyMessageId = ctx.message?.message_id;
  const userId = ctx.message?.from?.id.toString();
  const chatId = ctx.message?.chat?.id.toString(); // Get chat ID
  const username = getUsername(ctx.message?.from, userId);

  if (username === 'ylysak') {
    ctx.reply('/ban');
  }

  if (inputText) {
    const match = inputText.match(
      /((\d+h)?\s?(\d+m)?\s?(\d+s)?),?\s?(\d+)\s?kcal,\s?([\d.]+)\s?km/
    );

    if (match) {
      const [_, time, hours, minutes, seconds, kcal, distance] = match;
      const parsedHours = hours ? parseInt(hours) : 0;
      const parsedMinutes = minutes ? parseInt(minutes) : 0;
      const parsedSeconds = seconds ? parseInt(seconds) : 0;

      const entry = new UserEntry({
        userId,
        chatId,
        username,
        hours: parsedHours,
        minutes: parsedMinutes,
        seconds: parsedSeconds,
        kcal: parseInt(kcal),
        distance: parseFloat(distance),
      });

      try {
        const res = await entry.save();
        console.log('Entry saved successfully:', res);
        ctx.reply(
          `Тренування додано! \n ${time}, ${entry.kcal} ккал, ${entry.distance} км`,
          { reply_to_message_id: replyMessageId }
        );
      } catch (err) {
        ctx.reply('Error saving entry:', err);
      }
    } else {
      await ctx.reply(
        'Invalid entry format. Example: /ringfit 1h 26m 36s, 155 kcal, 2.5 km'
      );
    }
  }
});

bot.command('myresults', async (ctx: Context) => {
  const userId = ctx.message?.from?.id.toString();

  try {
    const userEntries = await UserEntry.find({ userId });
    const totalTime = userEntries.reduce(
      (total, entry) =>
        total + entry.hours * 3600 + entry.minutes * 60 + entry.seconds,
      0
    );
    const totalKcal = userEntries.reduce(
      (total, entry) => total + entry.kcal,
      0
    );

    const avgTimeInSeconds = totalTime / userEntries.length;
    const avgTimeFormatted = formatTime(avgTimeInSeconds); // Implement this function
    const totalTimeFormatted = formatTime(totalTime);

    const avgKcal = Math.round(totalKcal / userEntries.length);
    ctx.reply(
      `
@${ctx.message?.from?.username}, твої результати
🎯 Всього занять: ${userEntries.length}\n
⏳ Загальний час: ${totalTimeFormatted}
      Середній час: ${avgTimeFormatted}
💪 Всього калорій: ${totalKcal}
      Середня кількість калорій: ${avgKcal}`
    );
  } catch (err) {
    ctx.reply('Error retrieving entries:', err);
    console.error('Error retrieving entries:', err);
    return;
  }
});

bot.command('rating', async (ctx: Context) => {
  try {
    const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

    const withMedal = (rating: number) =>
      rating === 0 ? '🥇' : rating === 1 ? '🥈' : rating === 2 ? '🥉' : '';

    // ratings by total
    const ratings = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
      {
        $group: {
          _id: '$userId',
          totalTrainings: { $sum: 1 },
          username: { $first: '$username' },
        },
      },
      { $sort: { totalTrainings: -1 } },
    ]).exec();

    const ratingText = ratings.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username}\n\tКількість: ${
          rating.totalTrainings
        }\n`
    );

    const ratingMessage = '🏆 КІЛЬКІСТЬ ТРЕНУВАНЬ\n\n' + ratingText.join('\n');

    // ratings by avg time
    const ratingsByTime = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
      {
        $group: {
          _id: '$userId',
          avgTime: {
            $avg: {
              $sum: [
                '$hours',
                { $multiply: ['$minutes', 60] },
                { $multiply: ['$seconds', 3600] },
              ],
            },
          },
          avgKcal: { $avg: '$kcal' },
          username: { $first: '$username' },
        },
      },
      { $sort: { avgTime: -1 } },
    ]).exec();

    const ratingByTimeText = ratingsByTime.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username}\n\t\t${formatTime(
          rating.avgTime
        )}\n`
    );

    const ratingByTimeMessage =
      '⏳ СЕРЕДНІЙ ЧАС\n\n' + ratingByTimeText.join('\n');

    // ratings by avg kcal
    const ratingsByKcal = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
      {
        $group: {
          _id: '$userId',
          avgKcal: { $avg: '$kcal' },
          username: { $first: '$username' },
        },
      },
      { $sort: { avgKcal: -1 } },
    ]).exec();

    const ratingByKcalText = ratingsByKcal.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${
          rating.username
        }\n\t${rating.avgKcal.toFixed(2)}\n`
    );

    const ratingsByKcalMessage =
      '💪 СЕРЕДНЯ КІЛЬКІСТЬ КАЛОРІЙ\n\n' + ratingByKcalText.join('\n');

    ctx.reply(`Рейтинги:`);
    await ctx.reply(`${ratingMessage}`);
    await ctx.reply(`${ratingByTimeMessage}`);
    await ctx.reply(`${ratingsByKcalMessage}`);
  } catch (err) {
    ctx.reply('Error calculating ratings.');
    console.error('Error calculating ratings:', err);
    return;
  }
});

bot.command('updateusername', async (ctx: Context) => {
  const userId = ctx.message?.from?.id.toString();
  const newUsername = getUsername(ctx.message?.from, userId);

  try {
    await UserEntry.updateMany(
      { userId: userId },
      { $set: { username: newUsername } }
    );
    ctx.reply('Username updated successfully!');
  } catch (err) {
    console.error('Error updating username:', err);
    ctx.reply('Error updating username:', err);
    return;
  }
});
