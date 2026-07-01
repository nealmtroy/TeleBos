import React from "react";
import { Banner } from "@/components/ui/banner";
import { Navbar5 } from "@/components/ui/navbar-5";

const DemoOne = () => {
  return (
    <div className="scale-70">
      <Navbar5 />
    </div>
  );
};

const BannerDemo = () => {
  return (
    <div className="p-10 w-full">
      <Banner
        id="banner-id"
        variant="rainbow"
        className="shadow-lg bg-white dark:bg-transparent"
        rainbowColors={[
          "rgba(231,77,255,0.77)",
          "rgba(231,77,255,0.77)",
          "transparent",
          "rgba(231,77,255,0.77)",
          "transparent",
          "rgba(231,77,255,0.77)",
          "transparent",
        ]}
      >
        🚀 Project evolving more features soon!
      </Banner>
    </div>
  );
};

export { DemoOne };
export default BannerDemo;
