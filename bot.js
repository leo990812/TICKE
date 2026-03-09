require("dotenv").config();
const {
    Client, GatewayIntentBits, Partials,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const settingsDB = require("./settingsDB");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

const TICKET_CATEGORY_NAME = "🎫票口 Ticket";

async function fetchAllMessages(channel) {
    let messages = [];
    let lastId;
    try {
        while (true) {
            const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
            if (fetched.size === 0) break;
            messages = messages.concat(Array.from(fetched.values()));
            lastId = fetched.last().id;
            if (fetched.size < 100) break;
        }
    } catch (e) { console.error("抓取失敗:", e); }
    return messages.reverse();
}

client.once("ready", () => console.log(`✅ Bot 已登入 ${client.user.tag}`));

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;
    const config = settingsDB[interaction.guild.id] || {};

    if (interaction.customId === "create_ticket") {
        let category = interaction.guild.channels.cache.find(c => c.type === 4 && c.name === TICKET_CATEGORY_NAME);
        if (!category) category = await interaction.guild.channels.create({ name: TICKET_CATEGORY_NAME, type: 4 });

        const existing = interaction.guild.channels.cache.find(c => c.topic === `ticketOwner:${interaction.user.id}`);
        if (existing) return interaction.reply({ content: `⚠️ 已有工單: ${existing}`, ephemeral: true });

        const channel = await interaction.guild.channels.create({
            name: `工單-${interaction.user.username}`,
            type: 0,
            topic: `ticketOwner:${interaction.user.id}`,
            parent: category.id,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                ...(config.supportRole ? [{ id: config.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
            ]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("claim_ticket").setLabel("🧾 接手工單").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 關閉工單").setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${interaction.user.id}>\n${config.welcomeMessage || "📩 歡迎"}${config.supportRole ? `\n<@&${config.supportRole}>` : ""}`, components: [row] });
        await interaction.reply({ content: `✅ 已建立：${channel}`, ephemeral: true });
    }

    if (interaction.customId === "confirm_close") {
        await interaction.update({ content: "📝 儲存紀錄中...", components: [] });
        try {
            const messages = await fetchAllMessages(interaction.channel);
            const logs = messages.map(m => `[${m.createdAt.toLocaleString('zh-TW')}] ${m.author.tag}: ${m.content || "[附件]"}`).join("\n");
            
            const logPath = path.join(__dirname, "logs");
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            const fileName = `${interaction.channel.name}.txt`;
            const filePath = path.join(logPath, fileName);
            fs.writeFileSync(filePath, logs);

            const logChannelId = config.logChannel; // 從面板設定抓取
            const logChannel = interaction.guild.channels.cache.get(logChannelId);

            if (logChannel) {
                await logChannel.send({
                    content: `🗂️ 工單 **${interaction.channel.name}** 已結案\n執行人：${interaction.user}`,
                    files: [new AttachmentBuilder(filePath)]
                });
            }

            await interaction.followUp({ content: "✅ 紀錄已保存，頻道即將刪除。", ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        } catch (err) {
            console.error(err);
            interaction.channel.delete().catch(() => {});
        }
    }

    // 接手與關閉確認邏輯
    if (interaction.customId === "claim_ticket") await interaction.reply({ content: `✅ ${interaction.user} 已接手。` });
    if (interaction.customId === "close_ticket") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_close").setLabel("確定").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("cancel_close").setLabel("取消").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: "確定關閉？", components: [row], ephemeral: true });
    }
});

module.exports = client;
client.login(process.env.DISCORD_TOKEN);
