const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, RoleSelectMenuBuilder } = require('discord.js');
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

const serverSettings = new Map(); 
const activeSessions = new Map(); 
const weeklyStats = new Map();

const tempDoomsSetup = new Map();
const doomsSettings = new Map();

const FOOTER_TEXT = "صنع من قبل عبدالله (fr_lv)";

const commands = [
    new SlashCommandBuilder()
        .setName('add-login')
        .setDescription('إضافة روم مخصص لتسجيل الدخول')
        .addChannelOption(option => option.setName('channel').setDescription('اختر روم تسجيل الدخول').setRequired(true)),

    new SlashCommandBuilder()
        .setName('add-logout')
        .setDescription('إضافة روم مخصص لتسجيل الخروج')
        .addChannelOption(option => option.setName('channel').setDescription('اختر روم تسجيل الخروج').setRequired(true)),

    new SlashCommandBuilder()
        .setName('add-break')
        .setDescription('إضافة روم مخصص للغفوة والعودة')
        .addChannelOption(option => option.setName('channel').setDescription('اختر روم البريك').setRequired(true)),

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

        let settings = serverSettings.get(guildId) || { login: null, logout: null, break: null };

        if (commandName === 'add-login') {
            const channel = options.getChannel('channel');
            settings.login = channel.id;
            serverSettings.set(guildId, settings);
            return interaction.reply({ content: `✅ تم تعيين روم تسجيل الدخول بنجاح إلى: ${channel}`, ephemeral: true });
        } 
        else if (commandName === 'add-logout') {
            const channel = options.getChannel('channel');
            settings.logout = channel.id;
            serverSettings.set(guildId, settings);
            return interaction.reply({ content: `✅ تم تعيين روم تسجيل الخروج بنجاح إلى: ${channel}`, ephemeral: true });
        } 
        else if (commandName === 'add-break') {
            const channel = options.getChannel('channel');
            settings.break = channel.id;
            serverSettings.set(guildId, settings);
            return interaction.reply({ content: `✅ تم تعيين روم البريك بنجاح إلى: ${channel}`, ephemeral: true });
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

    // معالجة اختيار الرتب عبر القوائم المنسدلة مع منع الـ Timeout
    if (interaction.isRoleSelectMenu()) {
        await interaction.deferUpdate(); // منع حدوث خطأ التأخير 3 ثواني من ديسكورد

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

    const settings = serverSettings.get(guildId) || { login: null, logout: null, break: null };

    if (content === 'تسجيل دخول') {
        if (!settings.login) return message.reply('❌ لم يتم تعيين روم تسجيل الدخول في هذا السيرفر بعد!');
        if (channelId !== settings.login) return message.reply(`❌ يرجى استخدام أمر "تسجيل دخول" في الروم المخصص له فقط: <#${settings.login}>`);
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
        if (!settings.break) return message.reply('❌ لم يتم تعيين روم البريك في هذا السيرفر بعد!');
        if (channelId !== settings.break) return message.reply(`❌ يرجى استخدام أمر "غفوة" في روم البريك المخصص فقط: <#${settings.break}>`);
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (session.isBreak) return message.reply('⚠️ أنت في بريك بالفعل!');

        session.isBreak = true;
        session.breakStart = now;
        return message.reply(`💤 تم تسجيل دخولي للبريك. استمتع بوقتك!\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'عودة') {
        if (!settings.break) return message.reply('❌ لم يتم تعيين روم البريك في هذا السيرفر بعد!');
        if (channelId !== settings.break) return message.reply(`❌ يرجى استخدام أمر "عودة" في روم البريك المخصص فقط: <#${settings.break}>`);
        const session = activeSessions.get(userId);
        if (!session) return message.reply('❌ أنت لم تسجل دخول.');
        if (!session.isBreak) return message.reply('⚠️ أنت لست في بريك أساساً!');

        session.breakTime += (now - session.breakStart);
        session.isBreak = false;
        session.breakStart = null;

        return message.reply(`▶️ عوداً حميداً! تم استئناف احتساب وقت الخدمة.\n\n_${FOOTER_TEXT}_`);
    }

    if (content === 'تسجيل خروج') {
        if (!settings.logout) return message.reply('❌ لم يتم تعيين روم تسجيل الخروج في هذا السيرفر بعد!');
        if (channelId !== settings.logout) return message.reply(`❌ يرجى استخدام أمر "تسجيل خروج" في الروم المخصص له فقط: <#${settings.logout}>`);
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
