declare module '@expo/vector-icons' {
  import * as React from 'react';
  import type { TextProps } from 'react-native';

  interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  export class Ionicons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class MaterialIcons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class MaterialCommunityIcons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class FontAwesome extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class FontAwesome5 extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class Feather extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class AntDesign extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class Entypo extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class EvilIcons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class Foundation extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class Octicons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class SimpleLineIcons extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
  export class Zocial extends React.Component<IconProps> {
    static glyphMap: Record<string, number>;
  }
}
