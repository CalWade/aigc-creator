/**
 * Phase 2.23 fixtures · Prompt 实验室测试用例
 * 每个平台保留 tool 各 5 条测试用例(SAFETY_REVIEW / QUALITY_REVIEW / IMAGE_REVIEW)
 * 本期每类 5 条证明链路通,不灌满 PRD 要求的 300/100/50
 */
import { Prisma } from "@prisma/client";

export const PROMPT_TEST_CASES: Prisma.PromptTestCaseCreateManyInput[] = [
  // SAFETY_REVIEW 5 条
  {
    tool: "SAFETY_REVIEW",
    input: "这篇文章讨论了健康饮食的重要性。",
    expected: "low",
    category: "allow",
  },
  {
    tool: "SAFETY_REVIEW",
    input: "本文介绍了某赌博网站的赔率分析技巧。",
    expected: "high",
    category: "gambling",
  },
  {
    tool: "SAFETY_REVIEW",
    input: "某明星的私人照片被泄露,详细描述了照片内容。",
    expected: "high",
    category: "pornography",
  },
  {
    tool: "SAFETY_REVIEW",
    input: "这是一篇关于某保健品治疗效果的宣传软文,声称可以根治多种疾病。",
    expected: "medium",
    category: "fraud",
  },
  {
    tool: "SAFETY_REVIEW",
    input: "文章分析了当前的经济形势和政策走向。",
    expected: "low",
    category: "allow",
  },
  // QUALITY_REVIEW 5 条
  {
    tool: "QUALITY_REVIEW",
    input: "某公司发布了新产品。这款产品有很多功能。很多人喜欢它。它很便宜。",
    expected: "low",
    category: "quality_low",
  },
  {
    tool: "QUALITY_REVIEW",
    input:
      "根据中汽协2026年4月数据,新能源乘用车单月销量约95万辆,同比增长35%,显示市场需求持续强劲。",
    expected: "high",
    category: "quality_high",
  },
  {
    tool: "QUALITY_REVIEW",
    input: "近日某公司宣布了一项新计划,具体细节尚未公布,但市场反应积极。",
    expected: "medium",
    category: "quality_medium",
  },
  {
    tool: "QUALITY_REVIEW",
    input: "这款手机很好用,我非常喜欢,推荐给大家购买。",
    expected: "low",
    category: "quality_low",
  },
  {
    tool: "QUALITY_REVIEW",
    input:
      "本文从三个维度分析了5G-A商用对消费者和运营商的影响:终端价格、覆盖范围和应用场景,并引用WSTS和Gartner数据佐证。",
    expected: "high",
    category: "quality_high",
  },
  // IMAGE_REVIEW 5 条
  {
    tool: "IMAGE_REVIEW",
    input:
      '{"mime":"image/jpeg","filename":"product_photo.jpg","sceneTags":["商品"],"subjectTags":["电子产品"],"aiDeclared":false,"aiGenerated":false}',
    expected: "low",
    category: "allow",
  },
  {
    tool: "IMAGE_REVIEW",
    input:
      '{"mime":"image/png","filename":"headshot_portrait.png","sceneTags":["人物"],"subjectTags":["人脸正面"],"aiDeclared":false,"aiGenerated":false}',
    expected: "high",
    category: "face",
  },
  {
    tool: "IMAGE_REVIEW",
    input:
      '{"mime":"image/webp","filename":"stock_photo_watermarked.webp","sceneTags":["商业"],"subjectTags":["图表"],"aiDeclared":false,"aiGenerated":false}',
    expected: "medium",
    category: "watermark",
  },
  {
    tool: "IMAGE_REVIEW",
    input:
      '{"mime":"image/png","filename":"ai_art.png","sceneTags":["艺术"],"subjectTags":["抽象画"],"aiDeclared":false,"aiGenerated":false}',
    expected: "high",
    category: "ai_unmarked",
  },
  {
    tool: "IMAGE_REVIEW",
    input:
      '{"mime":"image/jpeg","filename":"landscape.jpg","sceneTags":["风景"],"subjectTags":["山川"],"aiDeclared":true,"aiGenerated":true}',
    expected: "low",
    category: "allow",
  },
];
