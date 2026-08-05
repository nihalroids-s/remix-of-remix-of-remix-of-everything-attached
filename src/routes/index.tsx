import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "No More Copium" },
      {
        name: "description",
        content:
          "Build your dream physique with clear direction, personal programming, and no more copium.",
      },
      { property: "og:title", content: "No More Copium" },
      {
        property: "og:description",
        content: "Build your dream physique with clear direction, personal programming, and no more copium.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});
