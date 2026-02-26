import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useResponsive } from "@actual-app/components/hooks/useResponsive";
import { styles } from "@actual-app/components/styles";
import { theme } from "@actual-app/components/theme";
import { View } from "@actual-app/components/view";

const HEADER_HEIGHT = 60;

type PageHeaderProps = {
  title: ReactNode;
  style?: CSSProperties;
};

export function PageHeader({ title, style }: PageHeaderProps) {
  useEffect(() => {
    if (typeof title === "string") {
      document.title = title + " - Actual";
    }
  }, [title]);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
        marginLeft: 20,
        ...style,
      }}
    >
      <h1
        style={{
          fontSize: 25,
          fontWeight: 500,
          margin: 0,
          padding: 0,
        }}
      >
        {title}
      </h1>
    </View>
  );
}

type MobilePageHeaderProps = {
  title: ReactNode;
  style?: CSSProperties;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
};

export function MobilePageHeader({
  title,
  style,
  leftContent,
  rightContent,
}: MobilePageHeaderProps) {
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        flexShrink: 0,
        height: HEADER_HEIGHT,
        backgroundColor: theme.mobileHeaderBackground,
        borderBottom: `1px solid ${theme.tableBorder}`,
        "& *": {
          color: theme.mobileHeaderText,
        },
        "& button[data-pressed]": {
          backgroundColor: theme.mobileHeaderTextHover,
        },
        ...style,
      }}
    >
      <View
        style={{
          flexBasis: "25%",
          justifyContent: "flex-start",
          flexDirection: "row",
        }}
      >
        {leftContent}
      </View>
      <h1
        style={{
          textAlign: "center",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          flexBasis: "50%",
          fontSize: 17,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          margin: 0,
          padding: 0,
        }}
      >
        {title}
      </h1>
      <View
        style={{
          flexBasis: "25%",
          justifyContent: "flex-end",
          flexDirection: "row",
        }}
      >
        {rightContent}
      </View>
    </View>
  );
}

type PageProps = {
  header: ReactNode;
  style?: CSSProperties;
  padding?: number;
  children: ReactNode;
  footer?: ReactNode;
};

export function Page({ header, style, padding, children, footer }: PageProps) {
  const { isNarrowWidth } = useResponsive();
  const childrenPadding = padding != null ? padding : isNarrowWidth ? 16 : 20;

  const headerToRender =
    typeof header === "string" ? (
      isNarrowWidth ? (
        <MobilePageHeader title={header} />
      ) : (
        <PageHeader title={header} />
      )
    ) : (
      header
    );

  return (
    <View
      style={{
        ...(!isNarrowWidth && styles.page),
        flex: 1,
        backgroundColor: isNarrowWidth ? theme.mobilePageBackground : theme.pageBackground,
        ...style,
      }}
    >
      {headerToRender}
      <View
        id="main-content"
        role="main"
        style={{
          flex: 1,
          overflowY: isNarrowWidth ? "auto" : undefined,
          padding: `0 ${childrenPadding}px`,
        }}
      >
        {children}
      </View>
      {footer}
    </View>
  );
}
