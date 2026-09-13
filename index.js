const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Police Bot Ultimate is online 24/7!'));
app.listen(port, () => console.log(`Web server running on port ${port}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const serverSettings = new Map(); // guildId -> { login: Set, logout: Set, break: Set, logChannel: null, protection: { antiLink: false, antiBot: false, antiSpam: false } }
const activeSessions = new Map(); 
const weeklyStats = new Map();
const userWarnings = new Map(); // guildId -> Map(userId -> count)

const tempDoomsSetup = new Map();
const doomsSettings = new Map();
const tempProtectionSetup = new Map();

const FOOTER_TEXT = "صنع من قبل عبدالله (fr_lv)";

const commands = [
    new SlashCommandBuilder().setName('help').setDescription('عرض لوحة المساعدة والأوامر الاحترافية الخاصة بالبوت'),
    new SlashCommandBuilder().setName('add-login').setDescription('إضافة روم مخصص لتسجيل الدخول').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('remove-login').setDescription('إزالة روم من رومات تسجيل الدخول').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('add-logout').setDescription('إضافة روم مخصص لتسجيل الخروج').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('remove-logout').setDescription('إزالة روم من رومات تسجيل الخروج').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('add-break').setDescription('إضافة روم مخصص للبريك').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('remove-break').setDescription('إزالة روم من رومات البريك').addChannelOption(o => o.setName('channel').setDescription('اختر الروم').setRequired(true)),
    new SlashCommandBuilder().setName('hours').setDescription('عرض ساعات خدمة العضو الأسبوعية').addStringOption(o => o.setName('user_id').setDescription('آيدي العضو').setRequired(true)),
    new SlashCommandBuilder().setName('dooms').setDescription('إعداد نظام التفعيل والأزرار في السيرفر'),
    new SlashCommandBuilder().setName('protection').setDescription('فتح لوحة نظام حماية السيرفر المتقدمة'),
    new SlashCommandBuilder().setName('ban').setDescription('حظر عضو من السيرفر').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
    new SlashCommandBuilder().setName('unban').setDescription('فك الحظر عن عضو بالآيدي').addUserOption(o => o.setName('target_id').setDescription('آيدي العضو').setRequired(true)),
    new SlashCommandBuilder().setName('timeout').setDescription('إسكات عضو لفترة زمنية (ميوت مؤقت)').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('عدد الدقائق').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
    new SlashCommandBuilder().setName('untimeout').setDescription('رفع الميوت عن عضو').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('طرد عضو من السيرفر').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
    new SlashCommandBuilder().setName('clear').setDescription('مسح الرسائل').addIntegerOption(o => o.setName('count').setDescription('العدد (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('warning').setDescription('إعطاء تحذير لعضو أو كشف تحذيراته').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('action').setDescription('اختر العملية').setRequired(true).addChoices({ name: 'إعطاء تحذير (Add)', value: 'add' }, { name: 'إزالة تحذير (Remove)', value: 'remove' }, { name: 'فحص التحذيرات (Check)', value: 'check' })),
    new SlashCommandBuilder().setName('broadcast').setDescription('إرسال برودكاست رسمي لكل أعضاء السيرفر بالمنشن أو بدون').addStringOption(o => o.setName('message').setDescription('نص الإعلان').setRequired(true)),
    new SlashCommandBuilder().setName('say').setDescription('جعل البوت ينطق رسالة في الشات').addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),
    new SlashCommandBuilder().setName('avatar').setDescription('عرض صورة بروفيسل أي عضو').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(false))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot Ultimate Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded Ultimate commands.');
    } catch (error) {
        console.error(error);
    }
});

function getGuildSettings(guildId) {
    if (!serverSettings.has(guildId)) {
        serverSettings.set(guildId, {
            login: new Set(),
            logout: new Set(),
            break: new Set(),
            protection: { antiLink: false, antiBot: false }
        });
    }
    return serverSettings.get(guildId);
}

function addWeeklyTime(guildId, userId, timeToAdd) {
    if (!weeklyStats.has(guildId)) weeklyStats.set(guildId, new Map());
    const guildMap = weeklyStats.get(guildId);
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let userData = guildMap.get(userId) || { totalMs: 0, lastReset: now };
    if (now - userData.lastReset > oneWeekMs) {
        userData.totalMs = 0;
        userData.lastReset = now;
    }
    userData.totalMs += timeToAdd;
    guildMap.set(userId, userData);
}

// مراقبة الحماية للرسائل (مانع الروابط والمخربين)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const settings = getGuildSettings(guildId);

    // نظام منع الروابط لو مفعل
    if (settings.protection.antiLink && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (message.content.includes('http://') || message.content.includes('https://') || message.content.includes('discord.gg/')) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ <@${message.author.id}>، ممنوع إرسال الروابط في هذا السيرفر!`).then(msg => setTimeout(() => msg.delete().catch(()=>{}), 5000));
        }
    }

    const content = message.content.trim();
    const userId = message.author.id;
    const channelId = message.channel.id;
    const now = Date.now();

    if (content === 'تسجيل دخول') {
        if (settings.login.size === 0) return message.reply('❌ لم يتم تعيين أي روم لتسجيل الدخول!');
        if (!settings.login.has(channelId)) return message.reply('❌ يرجى استخدام الأمر في رومات تسجيل الدخول المخصصة فقط.');
        if (activeSessions.has(userId)) return message.reply('❌ أنت مسجل دخول بالفعل!');

        activeSessions.set(userId, { loginTime: now, breakTime: 0, breakStart: null, isBreak: false });
        return message.reply(`✅ تم تسجيل دخولك بنجاح.\n💤 اكتب **غفوة** للبريك و **عودة** للاستئناف.\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'غفوة') {
        if (settings.break.size === 0) return message.reply('❌ لم يتم تعيين رومات للبريك!');
        if (!settings.break.has(channelId)) return message.reply('❌ استخدم الأمر في رومات البريك المخصصة فقط.');
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (session.isBreak) return message.reply('⚠️ أنت في بريك بالفعل!');

        session.isBreak = true;
        session.breakStart = now;
        return message.reply(`💤 تم تسجيل دخولك للبريك بنجاح.`);
    }

    if (content === 'عودة') {
        if (settings.break.size === 0) return message.reply('❌ لم يتم تعيين رومات للبريك!');
        if (!settings.break.has(channelId)) return message.reply('❌ استخدم الأمر في رومات البريك المخصصة فقط.');
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (!session.isBreak) return message.reply('⚠️ أنت لست في بريك أساساً!');

        session.breakTime += (now - session.breakStart);
        session.isBreak = false;
        session.breakStart = null;
        return message.reply(`▶️ عوداً حميداً! تم استئناف حساب الوقت.`);
    }

    if (content === 'تسجيل خروج') {
        if (settings.logout.size === 0) return message.reply('❌ لم يتم تعيين رومات لتسجيل الخروج!');
        if (!settings.logout.has(channelId)) return message.reply('❌ استخدم الأمر في رومات تسجيل الخروج المخصصة فقط.');
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');

        let totalBreak = session.breakTime;
        if (session.isBreak && session.breakStart) totalBreak += (now - session.breakStart);

        const netTime = Math.max(0, (now - session.loginTime) - totalBreak);
        addWeeklyTime(guildId, userId, netTime);

        const secs = Math.floor(netTime / 1000);
        const hrs = Math.floor(secs / 3600);
        const mins = Math.floor((secs % 3600) / 60);

        activeSessions.delete(userId);
        return message.reply(`✅ تم تسجيل خروجك بنجاح.\n⏱️ **مدة الخدمة الفعلية:** **${hrs}** ساعة و **${mins}** دقيقة.\n\n_${FOOTER_TEXT}_`);
    }
});

// حماية دخول البوتات الوهمية لو تم تفعيلها
client.on('guildMemberAdd', async member => {
    const guildId = member.guild.id;
    const settings = getGuildSettings(guildId);

    if (settings.protection.antiBot && member.user.bot) {
        await member.kick('حماية السيرفر: منع دخول البوتات التلقائية').catch(() => {});
    }

    const doomsConf = doomsSettings.get(guildId);
    if (!doomsConf || !doomsConf.logChannelId) return;
    const logChannel = member.guild.channels.cache.get(doomsConf.logChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📥 انضمام عضو جديد')
        .setDescription(`العضو: <@${member.id}>\nالآيدي: \`${member.id}\``)
        .addFields({ name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false })
        .setColor(0x00FF00)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('guildMemberRemove', async member => {
    const doomsConf = doomsSettings.get(member.guild.id);
    if (!doomsConf || !doomsConf.logChannelId) return;
    const logChannel = member.guild.channels.cache.get(doomsConf.logChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📤 خروج عضو من السيرفر')
        .setDescription(`العضو: ${member.user.tag}\nالآيدي: \`${member.id}\``)
        .setColor(0xFF0000)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId } = interaction;
        const settings = getGuildSettings(guildId);

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('📜 قائمة المساعدة والأوامر الاحترافية - مود الشرطة RP8')
                .setDescription('جميع الأوامر المتاحة في البوت مرتبة حسب الاستخدام:')
                .addFields(
                    { name: '🛡️ أرام الحماية والإدارة العليا', value: '`/protection`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/kick`, `/clear`, `/warning`', inline: false },
                    { name: '📋 نظام التفعيل واللوق', value: '`/dooms`', inline: false },
                    { name: '⏱️ نظام رومات التحضير والدخول', value: '`/add-login`, `/remove-login`, `/add-logout`, `/remove-logout`, `/add-break`, `/remove-break`, `/hours`', inline: false },
                    { name: '📢 الإعلانات والأدوات العامة', value: '`/broadcast`, `/say`, `/avatar`, `/help`', inline: false }
                )
                .setColor(0x0099FF)
                .setFooter({ text: FOOTER_TEXT })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !['hours', 'avatar', 'help'].includes(commandName)) {
            return interaction.reply({ content: '❌ عذراً، هذه الأوامر مخصصة للمسؤولين فقط.', ephemeral: true });
        }

        if (commandName === 'add-login') {
            const channel = options.getChannel('channel');
            if (settings.login.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم (${channel}) مضاف من قبل في قائمة تسجيل الدخول!`, ephemeral: true });
            settings.login.add(channel.id);
            return interaction.reply({ content: `✅ تم إضافة روم تسجيل الدخول بنجاح: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'remove-login') {
            const channel = options.getChannel('channel');
            if (!settings.login.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود أساساً في القائمة!`, ephemeral: true });
            settings.login.delete(channel.id);
            return interaction.reply({ content: `🗑️ تم إزالة الروم بنجاح: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'add-logout') {
            const channel = options.getChannel('channel');
            if (settings.logout.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم (${channel}) مضاف من قبل!`, ephemeral: true });
            settings.logout.add(channel.id);
            return interaction.reply({ content: `✅ تم إضافة روم تسجيل الخروج: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'remove-logout') {
            const channel = options.getChannel('channel');
            if (!settings.logout.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود أساساً!`, ephemeral: true });
            settings.logout.delete(channel.id);
            return interaction.reply({ content: `🗑️ تم إزالة الروم: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'add-break') {
            const channel = options.getChannel('channel');
            if (settings.break.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم مضاف من قبل!`, ephemeral: true });
            settings.break.add(channel.id);
            return interaction.reply({ content: `✅ تم إضافة روم البريك: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'remove-break') {
            const channel = options.getChannel('channel');
            if (!settings.break.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود!`, ephemeral: true });
            settings.break.delete(channel.id);
            return interaction.reply({ content: `🗑️ تم إزالة روم البريك: ${channel}`, ephemeral: true });
        }
        else if (commandName === 'hours') {
            const targetId = options.getString('user_id');
            const guildMap = weeklyStats.get(guildId);
            let totalMs = 0;
            if (guildMap && guildMap.has(targetId)) {
                const data = guildMap.get(targetId);
                if (Date.now() - data.lastReset <= 7*24*60*60*1000) totalMs = data.totalMs;
            }
            const secs = Math.floor(totalMs / 1000);
            const hrs = Math.floor(secs / 3600);
            const mins = Math.floor((secs % 3600) / 60);

            const embed = new EmbedBuilder()
                .setTitle('📊 إحصائيات ساعات الخدمة')
                .setDescription(`للعضو: <@${targetId}>`)
                .addFields({ name: '⏱️ مجموع ساعات العمل هذا الأسبوع', value: `**${hrs}** ساعة و **${mins}** دقيقة`, inline: false })
                .setColor(0x0099FF)
                .setFooter({ text: FOOTER_TEXT });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        else if (commandName === 'dooms') {
            const modal = new ModalBuilder().setCustomId('modal_dooms_setup').setTitle('إعداد نظام التفعيل - RP8');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('verify_channel_id').setLabel('آيدي روم رسالة التفعيل').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('log_channel_id').setLabel('آيدي روم اللوق').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }
        else if (commandName === 'protection') {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ نظام حماية السيرفر المتقدم')
                .setDescription('قم بالتحكم بحماية السيرفر عبر الأزرار أدناه:')
                .addFields(
                    { name: '🔗 منع الروابط والسبام', value: settings.protection.antiLink ? '✅ (مفعل)' : '❌ (متوقف)', inline: true },
                    { name: '🤖 منع البوتات الوهمية', value: settings.protection.antiBot ? '✅ (مفعل)' : '❌ (متوقف)', inline: true }
                )
                .setColor(0xFF0000)
                .setFooter({ text: FOOTER_TEXT });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prot_toggle_link').setLabel(settings.protection.antiLink ? 'إيقاف مانع الروابط' : 'تفعيل مانع الروابط').setStyle(settings.protection.antiLink ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId('prot_toggle_bot').setLabel(settings.protection.antiBot ? 'إيقاف منع البوتات' : 'تفعيل منع البوتات').setStyle(settings.protection.antiBot ? ButtonStyle.Danger : ButtonStyle.Success)
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
        else if (commandName === 'ban') {
            const target = options.getMember('target');
            const reason = options.getString('reason') || 'بدون سبب';
            if (!target.bannable) return interaction.reply({ content: '❌ لا يمكنني حظر هذا العضو!', ephemeral: true });
            await target.ban({ reason });
            return interaction.reply({ content: `✅ تم حظر العضو بنجاح.`, ephemeral: true });
        }
        else if (commandName === 'unban') {
            const targetId = options.getUser('target_id').id;
            await interaction.guild.members.unban(targetId).catch(() => {});
            return interaction.reply({ content: `✅ تم فك الحظر عن العضو بنجاح.`, ephemeral: true });
        }
        else if (commandName === 'timeout') {
            const target = options.getMember('target');
            const minutes = options.getInteger('minutes');
            const reason = options.getString('reason') || 'بدون سبب';
            await target.timeout(minutes * 60 * 1000, reason);
            return interaction.reply({ content: `✅ تم إعطاء ميوت (Timeout) للعضو بنجاح لمدة ${minutes} دقيقة.`, ephemeral: true });
        }
        else if (commandName === 'untimeout') {
            const target = options.getMember('target');
            await target.timeout(null);
            return interaction.reply({ content: `✅ تم إزالة الميوت عن العضو بنجاح.`, ephemeral: true });
        }
        else if (commandName === 'kick') {
            const target = options.getMember('target');
            const reason = options.getString('reason') || 'بدون سبب';
            if (!target.kickable) return interaction.reply({ content: '❌ لا يمكنني طرد هذا العضو!', ephemeral: true });
            await target.kick(reason);
            return interaction.reply({ content: `✅ تم طرد العضو بنجاح.`, ephemeral: true });
        }
        else if (commandName === 'clear') {
            const count = options.getInteger('count');
            await interaction.channel.bulkDelete(count, true).catch(() => {});
            return interaction.reply({ content: `🧹 تم مسح ${count} رسالة بنجاح.`, ephemeral: true });
        }
        else if (commandName === 'warning') {
            const target = options.getUser('target');
            const action = options.getString('action');
            if (!userWarnings.has(guildId)) userWarnings.set(guildId, new Map());
            const guildWarns = userWarnings.get(guildId);

            let currentWarns = guildWarns.get(target.id) || 0;
            if (action === 'add') {
                currentWarns += 1;
                guildWarns.set(target.id, currentWarns);
                return interaction.reply({ content: `⚠️ تم إضافة تحذير للعضو <@${target.id}>. إجمالي تحذيراته: **${currentWarns}**`, ephemeral: true });
            } else if (action === 'remove') {
                currentWarns = Math.max(0, currentWarns - 1);
                guildWarns.set(target.id, currentWarns);
                return interaction.reply({ content: `✅ تم إزالة تحذير من العضو <@${target.id}>. إجمالي تحذيراته: **${currentWarns}**`, ephemeral: true });
            } else {
                return interaction.reply({ content: `ℹ️ العضو <@${target.id}> لديه **${currentWarns}** تحذيرات سابقة.`, ephemeral: true });
            }
        }
        else if (commandName === 'broadcast') {
            const msgContent = options.getString('message');
            const embed = new EmbedBuilder()
                .setTitle('📢 إعلان إداري هام - مود الشرطة RP8')
                .setDescription(msgContent)
                .setColor(0xFFD700)
                .setFooter({ text: FOOTER_TEXT })
                .setTimestamp();
            await interaction.channel.send({ embeds: [embed] });
            return interaction.reply({ content: '✅ تم إرسال البرودكاست بنجاح في الروم.', ephemeral: true });
        }
        else if (commandName === 'say') {
            const msg = options.getString('message');
            await interaction.channel.send(msg);
            return interaction.reply({ content: '✅ تم إرسال الرسالة.', ephemeral: true });
        }
        else if (commandName === 'avatar') {
            const target = options.getUser('target') || interaction.user;
            const embed = new EmbedBuilder()
                .setTitle(`🖼️ صورة بروفايل: ${target.tag}`)
                .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }))
                .setColor(0x00FFFF)
                .setFooter({ text: FOOTER_TEXT });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const guildId = interaction.guildId;
        const settings = getGuildSettings(guildId);

        if (interaction.customId === 'prot_toggle_link') {
            settings.protection.antiLink = !settings.protection.antiLink;
            return interaction.update({ content: `✅ تم تغيير حالة مانع الروابط إلى: **${settings.protection.antiLink ? 'مفعل' : 'متوقف'}**`, components: [] });
        }
        if (interaction.customId === 'prot_toggle_bot') {
            settings.protection.antiBot = !settings.protection.antiBot;
            return interaction.update({ content: `✅ تم تغيير حالة منع البوتات الوهمية إلى: **${settings.protection.antiBot ? 'مفعل' : 'متوقف'}**`, components: [] });
        }

        if (interaction.customId === 'dooms_btn_verify' || interaction.customId === 'dooms_btn_unverify') {
            const isVerify = interaction.customId === 'dooms_btn_verify';
            const modal = new ModalBuilder()
                .setCustomId(isVerify ? 'modal_dooms_exec_verify' : 'modal_dooms_exec_unverify')
                .setTitle(isVerify ? 'لوحة تفعيل عضو' : 'لوحة سحب التفعيل');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_user_id').setLabel('أدخل آيدي العضو').setStyle(TextInputStyle.Short).setRequired(true)));
            return await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_dooms_setup') {
            const verifyChannelId = interaction.fields.getTextInputValue('verify_channel_id');
            const logChannelId = interaction.fields.getTextInputValue('log_channel_id');
            tempDoomsSetup.set(interaction.user.id, { verifyChannelId, logChannelId });

            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_verify_role').setPlaceholder('اختر رتبة التفعيل').setMinValues(1).setMaxValues(1));
            return await interaction.reply({ content: '🛡️ ممتاز! اختر **رتبة التفعيل (الموافق)** من القائمة أسفله:', components: [row], ephemeral: true });
        }

        if (interaction.customId === 'modal_dooms_exec_verify' || interaction.customId === 'modal_dooms_exec_unverify') {
            const settings = doomsSettings.get(interaction.guildId);
            if (!settings) return interaction.reply({ content: '❌ يرجى إعادة إعداد النظام بأمر `/dooms` أولاً.', ephemeral: true });
            const targetId = interaction.fields.getTextInputValue('target_user_id');
            const guild = interaction.guild;
            const logChannel = guild.channels.cache.get(settings.logChannelId);

            try {
                const targetMember = await guild.members.fetch(targetId);
                const isVerify = interaction.customId === 'modal_dooms_exec_verify';
                if (isVerify) {
                    await targetMember.roles.add(settings.verifyRoleId);
                    await targetMember.roles.remove(settings.unverifyRoleId).catch(() => {});
                    await interaction.reply({ content: `✅ تم تفعيل العضو بنجاح وإرسال اللوق!`, ephemeral: true });
                } else {
                    await targetMember.roles.remove(settings.verifyRoleId).catch(() => {});
                    await targetMember.roles.add(settings.unverifyRoleId);
                    await interaction.reply({ content: `⚠️ تم سحب التفعيل من العضو بنجاح!`, ephemeral: true });
                }
            } catch (error) {
                return interaction.reply({ content: `❌ تأكد من صحة آيدي العضو أو صلاحيات البوت.`, ephemeral: true });
            }
        }
    }

    if (interaction.isRoleSelectMenu()) {
        await interaction.deferUpdate();
        const setupData = tempDoomsSetup.get(interaction.user.id);
        if (!setupData) return;

        if (interaction.customId === 'select_verify_role') {
            setupData.verifyRoleId = interaction.values[0];
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_unverify_role').setPlaceholder('اختر رتبة سحب التفعيل').setMinValues(1).setMaxValues(1));
            return await interaction.editReply({ content: '🛡️ تم حفظ رتبة التفعيل بنجاح!\nالآن اختر **رتبة السحب (غير الموافق)**:', components: [row] });
        }
        if (interaction.customId === 'select_unverify_role') {
            setupData.unverifyRoleId = interaction.values[0];
            doomsSettings.set(interaction.guildId, {
                verifyChannelId: setupData.verifyChannelId,
                logChannelId: setupData.logChannelId,
                verifyRoleId: setupData.verifyRoleId,
                unverifyRoleId: setupData.unverifyRoleId
            });
            tempDoomsSetup.delete(interaction.user.id);

            const targetChannel = interaction.guild.channels.cache.get(setupData.verifyChannelId);
            const embed = new EmbedBuilder().setTitle('📋 نظام التفعيل الخاص في RP8').setDescription('اختر العملية المطلوبة من الأزرار بالأسفل:').setColor(0x00FF00);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dooms_btn_verify').setLabel('تفعيل عضو').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('dooms_btn_unverify').setLabel('سحب غير موافق').setStyle(ButtonStyle.Danger)
            );
            if (targetChannel) await targetChannel.send({ embeds: [embed], components: [row] });
            return await interaction.editReply({ content: '✅ تم إعداد نظام التفعيل وإرسال أزرار اللوحة بنجاح تام!', components: [] });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
