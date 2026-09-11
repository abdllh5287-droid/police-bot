const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');

// سيرفر ويب مصغر لبقاء البوت 24/7 عبر UptimeRobot
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Police Bot is online!'));
app.listen(port, () => console.log(`Web server running on port ${port}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const serverSettings = new Map(); 
const activeSessions = new Map();  

const commands = [
    new SlashCommandBuilder()
        .setName('add-login')
        .setDescription('إضافة روم مخصص لتسجيل الدخول')
        .addChannelOption(option => 
            option.setName('channel').setDescription('اختر روم تسجيل الدخول').setRequired(true)),

    new SlashCommandBuilder()
        .setName('add-logout')
        .setDescription('إضافة روم مخصص لتسجيل الخروج')
        .addChannelOption(option => 
            option.setName('channel').setDescription('اختر روم تسجيل الخروج').setRequired(true)),

    new SlashCommandBuilder()
        .setName('add-break')
        .setDescription('إضافة روم مخصص للغفوة والعودة')
        .addChannelOption(option => 
            option.setName('channel').setDescription('اختر روم البريك').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guildId } = interaction;
    
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للمسؤولين فقط.', ephemeral: true });
    }

    let settings = serverSettings.get(guildId) || { login: null, logout: null, break: null };

    if (commandName === 'add-login') {
        const channel = options.getChannel('channel');
        settings.login = channel.id;
        serverSettings.set(guildId, settings);
        await interaction.reply({ content: `✅ تم تعيين روم تسجيل الدخول بنجاح إلى: ${channel}`, ephemeral: true });
    } 
    else if (commandName === 'add-logout') {
        const channel = options.getChannel('channel');
        settings.logout = channel.id;
        serverSettings.set(guildId, settings);
        await interaction.reply({ content: `✅ تم تعيين روم تسجيل الخروج بنجاح إلى: ${channel}`, ephemeral: true });
    } 
    else if (commandName === 'add-break') {
        const channel = options.getChannel('channel');
        settings.break = channel.id;
        serverSettings.set(guildId, settings);
        await interaction.reply({ content: `✅ تم تعيين روم البريك (غفوة/عودة) بنجاح إلى: ${channel}`, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const userId = message.author.id;
    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const now = Date.now();

    const settings = serverSettings.get(guildId) || { login: null, logout: null, break: null };

    if (content === 'تسجيل دخول') {
        if (settings.login && channelId !== settings.login) {
            return message.reply(`❌ يرجى استخدام أمر "تسجيل دخول" في الروم المخصص له: <#${settings.login}>`);
        }
        if (activeSessions.has(userId)) {
            return message.reply('❌ أنت مسجل دخول بالفعل!');
        }

        activeSessions.set(userId, {
            loginTime: now,
            breakTime: 0,
            breakStart: null,
            isBreak: false
        });

        return message.reply('✅ تم تسجيل دخولك بنجاح.\n💤 اكتب **غفوة** فى روم البريك لإيقاف الوقت مؤقتًا.\n▶️ واكتب **عودة** لاستكمال حساب الوقت.');
    }

    if (content === 'غفوة') {
        if (settings.break && channelId !== settings.break) {
            return message.reply(`❌ يرجى استخدام أمر "غفوة" في روم البريك المخصص: <#${settings.break}>`);
        }
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (session.isBreak) return message.reply('⚠️ أنت في بريك بالفعل!');

        session.isBreak = true;
        session.breakStart = now;
        return message.reply('💤 تم تسجيل دخولي للبريك. استمتع بوقتك!');
    }

    if (content === 'عودة') {
        if (settings.break && channelId !== settings.break) {
            return message.reply(`❌ يرجى استخدام أمر "عودة" في روم البريك المخصص: <#${settings.break}>`);
        }
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (!session.isBreak) return message.reply('⚠️ أنت لست في بريك أساساً!');

        const breakDuration = now - session.breakStart;
        session.breakTime += breakDuration;
        session.isBreak = false;
        session.breakStart = null;

        return message.reply('▶️ عوداً حميداً! تم استئناف احتساب وقت الخدمة.');
    }

    if (content === 'تسجيل خروج') {
        if (settings.logout && channelId !== settings.logout) {
            return message.reply(`❌ يرجى استخدام أمر "تسجيل خروج" في الروم المخصص له: <#${settings.logout}>`);
        }
        const session = activeSessions.get(userId);
        if (!session) {
            return message.reply('❌ أنت لم تسجل دخول.');
        }

        let totalBreak = session.breakTime;
        if (session.isBreak && session.breakStart) {
            totalBreak += (now - session.breakStart);
        }

        const totalElapsedTime = now - session.loginTime;
        const netServiceTime = Math.max(0, totalElapsedTime - totalBreak);

        const totalSeconds = Math.floor(netServiceTime / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        activeSessions.delete(userId);

        return message.reply(`✅ تم تسجيل خروجك بنجاح.\n\n⏱️ **مدة خدمتك الفعلية:**\n**${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية**\n\n💤 وقت البريك غير محسوب ضمن مدة الخدمة.`);
    }
});

client.login(process.env.DISCORD_TOKEN);