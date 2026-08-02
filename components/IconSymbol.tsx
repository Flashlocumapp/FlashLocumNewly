// This file is a fallback for using MaterialIcons on Android and web.

import React from "react";
import { SymbolWeight } from "expo-symbols";
import {
  OpaqueColorValue,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web. This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 * Pass `android_material_community_icon_name` to use MaterialCommunityIcons instead (e.g. "stethoscope").
 */
export function IconSymbol({
  ios_icon_name = undefined,
  android_material_icon_name,
  android_material_community_icon_name,
  size = 24,
  color,
  style,
  // Forward only the event handlers we inject from EditableElement_ (and a few common RN/web props).
  onPress,
  onClick,
  onMouseOver,
  onMouseLeave,
  testID,
  accessibilityLabel,
}: {
  ios_icon_name?: string | undefined;
  android_material_icon_name: keyof typeof MaterialIcons.glyphMap;
  android_material_community_icon_name?: keyof typeof MaterialCommunityIcons.glyphMap;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
  onPress?: any;
  onClick?: any;
  onMouseOver?: any;
  onMouseLeave?: any;
  testID?: any;
  accessibilityLabel?: any;
}) {
  const commonProps = {
    onPress,
    onClick,
    onMouseOver,
    onMouseLeave,
    testID,
    accessibilityLabel,
    color,
    size,
  };

  if (android_material_community_icon_name) {
    return (
      <MaterialCommunityIcons
        {...commonProps}
        name={android_material_community_icon_name}
        style={[{ lineHeight: size } as StyleProp<TextStyle>, style as StyleProp<TextStyle>]}
      />
    );
  }

  return (
    <MaterialIcons
      {...commonProps}
      name={android_material_icon_name}
      style={style as StyleProp<TextStyle>}
    />
  );
}
