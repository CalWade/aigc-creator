import Link from "next/link";

import { Button } from "@bytedance-aigc/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@bytedance-aigc/ui/components/ui/card";

export default function RuleRechecksPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>规则复审</CardTitle>
          <CardDescription>规则更新后批量重审已发布作品,命中 BLOCK 自动下线</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            功能开发中,敬请期待。完成后将支持选择规则版本、触发批量重审、查看重审结果。
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">返回总览</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
