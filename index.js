const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Police Bot is online 24/7!'));
app.listen(port, () => console.log(`Web server running on port ${port}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// تخزين الرومات بصيغة Set لكل سيرفر
const serverSettings = new Map(); // guildId -> { login: Set, logout: Set, break: Set }
const activeSessions = new Map(); 
const weeklyStats = new Map();

const tempDoomsSetup = new Map();
const doomsSettings = new Map();

const FOOTER_TEXT = "صنع من قبل عبدالله (fr_lv)";

const commands = [
    // أمر شامل لإدارة رومات النظام (تسجيل الدخول، الخروج، البريك)
    new SlashCommandBuilder()
        .setName('setup-rooms')
        .setDescription('إدارة رومات نظام العمل (إضافة أو إزالة رومات الدخول، الخروج، البريك)')
        .addStringOption(option => 
            option.setName('action')
                .setDescription('اختر العملية المطلوبة')
                .setRequired(true)
                .addChoices(
                    { name: 'إضافة روم تسجيل دخول', value: 'add_login' },
                    { name: 'إزالة روم تسجيل دخول', value: 'remove_login' },
                    { name: 'إضافة روم تسجيل خروج', value: 'add_logout' },
                    { name: 'إزالة روم تسجيل خروج', value: 'remove_logout' },
                    { name: 'إضافة روم بريك (غفوة)', value: 'add_break' },
                    { name: 'إزالة روم بريك (غفوة)', value: 'remove_break' }
                ))
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('اختر الروم المراد ربطه أو إزالته')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)),

    new SlashCommandBuilder()
        .setName('hours')
        .setDescription('عرض مجموع ساعات وقت خدمة العضو خلال الأسبوع الحالي')
        .addStringOption(option => option.setName('user_id').setDescription('آيدي العضو المراد الاستعلام عنه').setRequired(true)),

    new SlashCommandBuilder()
        .setName('dooms')
        .setDescription('إعداد نظام التفعيل والأزرار في السيرفر باحترافية')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

function getGuildSettings(guildId) {
    if (!serverSettings.has(guildId)) {
        serverSettings.set(guildId, {
            login: new Set(),
            logout: new Set(),
            break: new Set()
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

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId } = interaction;
        
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للمسؤولين فقط.', ephemeral: true });
        }

        const settings = getGuildSettings(guildId);

        if (commandName === 'setup-rooms') {
            const action = options.getString('action');
            const channel = options.getChannel('channel');

            if (action === 'add_login') {
                if (settings.login.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم (${channel}) مضاف مسبقاً لقائمة تسجيل الدخول!`, ephemeral: true });
                settings.login.add(channel.id);
                return interaction.reply({ content: `✅ تم إضافة الروم ${channel} إلى **رومات تسجيل الدخول** بنجاح.`, ephemeral: true });
            }
            else if (action === 'remove_login') {
                if (!settings.login.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود في رومات تسجيل الدخول!`, ephemeral: true });
                settings.login.delete(channel.id);
                return interaction.reply({ content: `🗑️ تم إزالة الروم ${channel} من رومات تسجيل الدخول.`, ephemeral: true });
            }
            else if (action === 'add_logout') {
                if (settings.logout.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم (${channel}) مضاف مسبقاً لقائمة تسجيل الخروج!`, ephemeral: true });
                settings.logout.add(channel.id);
                return interaction.reply({ content: `✅ تم إضافة الروم ${channel} إلى **رومات تسجيل الخروج** بنجاح.`, ephemeral: true });
            }
            else if (action === 'remove_logout') {
                if (!settings.logout.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود في رومات تسجيل الخروج!`, ephemeral: true });
                settings.logout.delete(channel.id);
                return interaction.reply({ content: `🗑️ تم إزالة الروم ${channel} من رومات تسجيل الخروج.`, ephemeral: true });
            }
            else if (action === 'add_break') {
                if (settings.break.has(channel.id)) return interaction.reply({ content: `⚠️ هذا الروم (${channel}) مضاف مسبقاً لقائمة البريك!`, ephemeral: true });
                settings.break.add(channel.id);
                return interaction.reply({ content: `✅ تم إضافة الروم ${channel} إلى **رومات البريك** بنجاح.`, ephemeral: true });
            }
            else if (action === 'remove_break') {
                if (!settings.break.has(channel.id)) return interaction.reply({ content: `❌ هذا الروم غير موجود في رومات البريك!`, ephemeral: true });
                settings.break.delete(channel.id);
                return interaction.reply({ content: `🗑️ تم إزالة الروم ${channel} من رومات البريك.`, ephemeral: true });
            }
        }
        else if (commandName === 'hours') {
            const targetId = options.getString('user_id');
            const guildMap = weeklyStats.get(guildId);
            
            let totalMs = 0;
            if (guildMap && guildMap.has(targetId)) {
                const data = guildMap.get(targetId);
                const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - data.lastReset <= oneWeekMs) {
                    totalMs = data.totalMs;
                }
            }

            const totalSeconds = Math.floor(totalMs / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            const embed = new EmbedBuilder()
                .setTitle('📊 إحصائيات ساعات العمل الأسبوعية')
                .setDescription(`إحصائيات العضو: <@${targetId}> (${targetId})`)
                .addFields(
                    { name: '⏱️ مجموع الساعات هذا الأسبوع', value: `**${hours}** ساعة و **${minutes}** دقيقة و **${seconds}** ثانية`, inline: false },
                    { name: '🔄 حالة التصفير', value: 'تتم تصفير ساعات هذا الأسبوع تلقائياً كل 7 أيام.', inline: false }
                )
                .setColor(0x0099FF)
                .setFooter({ text: FOOTER_TEXT })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        else if (commandName === 'dooms') {
            const modal = new ModalBuilder()
                .setCustomId('modal_dooms_setup')
                .setTitle('إعداد نظام التفعيل - RP8');

            const channelInput = new TextInputBuilder()
                .setCustomId('verify_channel_id')
                .setLabel('آيدي روم رسالة التفعيل (الأزرار)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: 123456789123456789')
                .setRequired(true);

            const logChannelInput = new TextInputBuilder()
                .setCustomId('log_channel_id')
                .setLabel('آيدي روم اللوق (Log Channel)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: 123456789123456789')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(logChannelInput)
            );

            return await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_dooms_setup') {
            const verifyChannelId = interaction.fields.getTextInputValue('verify_channel_id');
            const logChannelId = interaction.fields.getTextInputValue('log_channel_id');

            tempDoomsSetup.set(interaction.user.id, { verifyChannelId, logChannelId });

            const row1 = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('select_verify_role')
                    .setPlaceholder('اختر رتبة التفعيل (الموافق) من هنا')
                    .setMinValues(1)
                    .setMaxValues(1)
            );

            return await interaction.reply({
                content: '🛡️ ممتاز! الآن من القائمة أسفله، اختر **رتبة التفعيل (الموافق)** بكل سهولة:',
                components: [row1],
                ephemeral: true
            });
        }

        if (interaction.customId === 'modal_dooms_exec_verify' || interaction.customId === 'modal_dooms_exec_unverify') {
            const settings = doomsSettings.get(interaction.guildId);
            if (!settings) return interaction.reply({ content: '❌ حدث خطأ، يرجى إعادة إعداد النظام بأمر `/dooms`.', ephemeral: true });

            const targetId = interaction.fields.getTextInputValue('target_user_id');
            const guild = interaction.guild;
            const logChannel = guild.channels.cache.get(settings.logChannelId);
            const admin = interaction.member;

            try {
                const targetMember = await guild.members.fetch(targetId);
                const isVerify = interaction.customId === 'modal_dooms_exec_verify';

                if (isVerify) {
                    await targetMember.roles.add(settings.verifyRoleId);
                    await targetMember.roles.remove(settings.unverifyRoleId).catch(() => {});
                    await interaction.reply({ content: `✅ تم تفعيل العضو بنجاح وإرسال اللوق!`, ephemeral: true });

                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('✅ لوق تفعيل عضو')
                            .addFields(
                                { name: 'الإداري', value: `<@${admin.id}>\n${admin.id}`, inline: false },
                                { name: 'العضو المفعل', value: `<@${targetMember.id}>\n${targetMember.id}`, inline: false }
                            )
                            .setColor(0x00FF00)
                            .setFooter({ text: FOOTER_TEXT })
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } else {
                    await targetMember.roles.remove(settings.verifyRoleId).catch(() => {});
                    await targetMember.roles.add(settings.unverifyRoleId);
                    await interaction.reply({ content: `⚠️ تم سحب الشروط من العضو بنجاح وإرسال اللوق!`, ephemeral: true });

                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🔴 لوق سحب غير موافق على الشروط والأحكام')
                            .addFields(
                                { name: 'الإداري', value: `<@${admin.id}>\n${admin.id}`, inline: false },
                                { name: 'العضو المسحوب منه', value: `<@${targetMember.id}>\n${targetMember.id}`, inline: false }
                            )
                            .setColor(0xFF0000)
                            .setFooter({ text: FOOTER_TEXT })
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: `❌ تأكد من صحة آيدي العضو أو تأكد أن رتبة البوت أعلى من رتبة العضو المراد تعديله.`, ephemeral: true });
            }
        }
    }

    if (interaction.isRoleSelectMenu()) {
        await interaction.deferUpdate();

        const setupData = tempDoomsSetup.get(interaction.user.id);
        if (!setupData) {
            return interaction.followUp({ content: '❌ انتهت الجلسة، يرجى إعادة كتابة أمر `/dooms`.', ephemeral: true });
        }

        if (interaction.customId === 'select_verify_role') {
            setupData.verifyRoleId = interaction.values[0];
            
            const row2 = new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('select_unverify_role')
                    .setPlaceholder('اختر رتبة السحب (غير الموافق) من هنا')
                    .setMinValues(1)
                    .setMaxValues(1)
            );

            return await interaction.editReply({
                content: '🛡️ تم حفظ رتبة التفعيل بنجاح!\nالآن من القائمة أسفله، اختر **رتبة السحب (غير الموافق)**:',
                components: [row2]
            });
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
            if (!targetChannel) {
                return interaction.editReply({ content: '❌ لم يتم العثور على روم التفعيل المحدد، تأكد من الآيدي!', components: [] });
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 نظام التفعيل الخاص في RP8')
                .setDescription('اختر العملية المطلوبة من الأزرار الموجودة بالأسفل للمتابعة.')
                .setColor(0x00FF00)
                .setFooter({ text: FOOTER_TEXT });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dooms_btn_verify').setLabel('تفعيل عضو').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('dooms_btn_unverify').setLabel('سحب غير موافق على الشروط والأحكام').setStyle(ButtonStyle.Danger)
            );

            await targetChannel.send({ embeds: [embed], components: [row] });
            return await interaction.editReply({ content: '✅ تم إعداد نظام التفعيل واختيار الرتب وإرسال لوحة الأزرار بنجاح تام!', components: [] });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'dooms_btn_verify' || interaction.customId === 'dooms_btn_unverify') {
            const settings = doomsSettings.get(interaction.guildId);
            if (!settings) return interaction.reply({ content: '❌ لم يتم إعداد نظام التفعيل بعد! استخدم `/dooms` أولاً.', ephemeral: true });

            const isVerify = interaction.customId === 'dooms_btn_verify';
            const modal = new ModalBuilder()
                .setCustomId(isVerify ? 'modal_dooms_exec_verify' : 'modal_dooms_exec_unverify')
                .setTitle(isVerify ? 'لوحة تفعيل عضو' : 'لوحة سحب غير موافق');

            const userInput = new TextInputBuilder()
                .setCustomId('target_user_id')
                .setLabel('أدخل آيدي العضو (User ID)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: 432387967051366400')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            return await interaction.showModal(modal);
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const userId = message.author.id;
    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const now = Date.now();

    const settings = getGuildSettings(guildId);

    if (content === 'تسجيل دخول') {
        if (settings.login.size === 0) return message.reply('❌ لم يتم تعيين أي روم لتسجيل الدخول في هذا السيرفر بعد! (استخدم `/setup-rooms`)');
        if (!settings.login.has(channelId)) {
            const channelsFormatted = Array.from(settings.login).map(id => `<#${id}>`).join(', ');
            return message.reply(`❌ يرجى استخدام أمر "تسجيل دخول" في أحد الرومات المخصصة له فقط:\n${channelsFormatted}`);
        }
        if (activeSessions.has(userId)) return message.reply('❌ أنت مسجل دخول بالفعل!');

        activeSessions.set(userId, {
            loginTime: now,
            breakTime: 0,
            breakStart: null,
            isBreak: false
        });

        return message.reply(`✅ تم تسجيل دخولك بنجاح.\n💤 اكتب **غفوة** فى روم البريك لإيقاف الوقت مؤقتًا.\n▶️ واكتب **عودة** لاستكمال حساب الوقت.\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'غفوة') {
        if (settings.break.size === 0) return message.reply('❌ لم يتم تعيين أي روم للبريك في هذا السيرفر بعد! (استخدم `/setup-rooms`)');
        if (!settings.break.has(channelId)) {
            const channelsFormatted = Array.from(settings.break).map(id => `<#${id}>`).join(', ');
            return message.reply(`❌ يرجى استخدام أمر "غفوة" في أحد رومات البريك المخصصة فقط:\n${channelsFormatted}`);
        }
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (session.isBreak) return message.reply('⚠️ أنت في بريك بالفعل!');

        session.isBreak = true;
        session.breakStart = now;
        return message.reply(`💤 تم تسجيل دخولي للبريك. استمتع بوقتك!\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'عودة') {
        if (settings.break.size === 0) return message.reply('❌ لم يتم تعيين أي روم للبريك في هذا السيرفر بعد! (استخدم `/setup-rooms`)');
        if (!settings.break.has(channelId)) {
            const channelsFormatted = Array.from(settings.break).map(id => `<#${id}>`).join(', ');
            return message.reply(`❌ يرجى استخدام أمر "عودة" في أحد رومات البريك المخصصة فقط:\n${channelsFormatted}`);
        }
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (!session.isBreak) return message.reply('⚠️ أنت لست في بريك أساساً!');

        session.breakTime += (now - session.breakStart);
        session.isBreak = false;
        session.breakStart = null;

        return message.reply(`▶️ عوداً حميداً! تم استئناف احتساب وقت الخدمة.\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'تسجيل خروج') {
        if (settings.logout.size === 0) return message.reply('❌ لم يتم تعيين أي روم لتسجيل الخروج في هذا السيرفر بعد! (استخدم `/setup-rooms`)');
        if (!settings.logout.has(channelId)) {
            const channelsFormatted = Array.from(settings.logout).map(id => `<#${id}>`).join(', ');
            return message.reply(`❌ يرجى استخدام أمر "تسجيل خروج" في أحد الرومات المخصصة له فقط:\n${channelsFormatted}`);
        }
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');

        let totalBreak = session.breakTime;
        if (session.isBreak && session.breakStart) {
            totalBreak += (now - session.breakStart);
        }

        const totalElapsedTime = now - session.loginTime;
        const netServiceTime = Math.max(0, totalElapsedTime - totalBreak);

        addWeeklyTime(guildId, userId, netServiceTime);

        const totalSeconds = Math.floor(netServiceTime / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        activeSessions.delete(userId);

        return message.reply(`✅ تم تسجيل خروجك بنجاح.\n\n⏱️ **مدة خدمتك الفعلية:**\n**${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية**\n\n📊 تمت إضافة هذه المدة لمجموع ساعاتك هذا الأسبوع.\n\n_${FOOTER_TEXT}_`);
    }
});

client.login(process.env.DISCORD_TOKEN);
