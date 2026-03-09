require("dotenv").config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const settingsDB = require("./settingsDB");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once("ready", () => {
    console.log(`🤖 機器人已上線：${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "create_ticket") {
        const config = settingsDB[interaction.guildId];
        if (!config) return interaction.reply({ content: "此伺服器尚未設定工單系統。", ephemeral: true });

        // 防止重複開單 (簡單範例：檢查是否有同名頻道)
        const ticketName = `ticket-${interaction.user.username}`.toLowerCase();
        const existing = interaction.guild.channels.cache.find(c => c.name === ticketName);
        if (existing) return interaction.reply({ content: "你已經有一個開啟中的工單了！", ephemeral: true });

        try {
            // 建立工單頻道
            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: 0, // GuildText
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: ["ViewChannel"] },
                    { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
                    { id: config.supportRole, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }
                ]
            });

            const embed = new EmbedBuilder()
                .setColor("#00ff00")
                .setTitle("工單已建立")
                .setDescription(config.welcomeMessage || "請描述您的問題，支援團隊會盡快處理。")
                .setTimestamp();

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("close_ticket").setLabel("關閉工單").setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ content: `<@${interaction.user.id}> 歡迎！`, embeds: [embed], components: [closeRow] });
            await interaction.reply({ content: `工單已建立：${ticketChannel}`, ephemeral: true });

        } catch (error) {
            console.error(error);
            interaction.reply({ content: "建立工單時發生錯誤。", ephemeral: true });
        }
    }

    if (interaction.customId === "close_ticket") {
        await interaction.reply("工單將在 5 秒後關閉...");
        setTimeout(() => interaction.channel.delete(), 5000);
    }
});

client.login(process.env.TOKEN);

// [重要] 匯出 client 供 server.js 使用
module.exports = client;
