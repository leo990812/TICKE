const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const config = require("./config.json");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.once("ready", () => {
    console.log(`✅ 已登入為 ${client.user.tag}`);
});

// ===== 開啟工單區塊 =====
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // === 開啟工單 ===
    if (interaction.customId === "open_ticket") {
        const existingChannel = interaction.guild.channels.cache.find(
            ch => ch.topic === `ticketOwner:${interaction.user.id}`
        );

        if (existingChannel) {
            return interaction.reply({
                content: `⚠️ 你已經有一個開啟中的工單：${existingChannel}`,
                ephemeral: true
            });
        }

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0, // GUILD_TEXT
            topic: `ticketOwner:${interaction.user.id}`,
            parent: config.ticketCategory,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: config.supportRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages
                    ]
                }
            ]
        });

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("🔒 關閉工單")
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `📩 ${interaction.user} 您的工單已建立，支援人員將儘快協助您。`,
            components: [closeButton]
        });

        await interaction.reply({
            content: `✅ 工單已建立：${channel}`,
            ephemeral: true
        });
    }

    // === 關閉工單 ===
    if (interaction.customId === "close_ticket") {
        const topic = interaction.channel.topic;
        const ticketOwner = topic?.startsWith("ticketOwner:") ? topic.split(":")[1] : null;

        const isTicketOwner = interaction.user.id === ticketOwner;
        const isSupport = interaction.member.roles.cache.has(config.supportRole);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (isTicketOwner || isSupport || isAdmin) {
            await interaction.channel.send(`🔒 此工單已由 ${interaction.user} 關閉。`);
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 1500);
        } else {
            await interaction.reply({
                content: "❌ 只有開啟者、支援人員或管理員可以關閉此工單。",
                ephemeral: true
            });
        }
    }
});

client.login(config.token);
