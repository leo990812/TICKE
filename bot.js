const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require("discord.js");
const settingsDB = require("./settingsDB");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`✅ 機器人登入成功: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const config = settingsDB[interaction.guildId];
    if (!config) return;

    if (interaction.customId === "create_ticket") {
        const ticketName = `ticket-${interaction.user.username}`;
        
        try {
            // 建立工單頻道
            const channel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: config.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("工單已建立")
                .setDescription(config.welcomeMessage || "請描述您的問題，支援團隊將盡快處理。")
                .setColor("#5865F2")
                .setTimestamp();

            const closeBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("close_ticket").setLabel("關閉工單").setStyle(ButtonStyle.Danger)
            );

            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [closeBtn] });
            await interaction.reply({ content: `工單已建立：${channel}`, ephemeral: true });
        } catch (err) {
            console.error("建立工單錯誤:", err);
            interaction.reply({ content: "無法建立工單，請檢查機器人是否有管理頻道權限。", ephemeral: true });
        }
    }

    if (interaction.customId === "close_ticket") {
        await interaction.reply("工單將在 5 秒後關閉...");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

client.login(process.env.TOKEN);

module.exports = client;
