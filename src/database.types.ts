export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      access: {
        Row: {
          created: string;
          id: number;
          labels: Json | null;
          location_id: number | null;
          multiplier: number;
          multiplier_reason: string | null;
          repository_id: number | null;
          updated: string | null;
          user_id: number;
        };
        Insert: {
          created?: string;
          id?: number;
          labels?: Json | null;
          location_id?: number | null;
          multiplier?: number;
          multiplier_reason?: string | null;
          repository_id?: number | null;
          updated?: string | null;
          user_id: number;
        };
        Update: {
          created?: string;
          id?: number;
          labels?: Json | null;
          location_id?: number | null;
          multiplier?: number;
          multiplier_reason?: string | null;
          repository_id?: number | null;
          updated?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "access_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_access_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_access_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      credits: {
        Row: {
          amount: number;
          created: string;
          id: number;
          location_id: number | null;
          permit_id: number | null;
          updated: string | null;
        };
        Insert: {
          amount: number;
          created?: string;
          id?: number;
          location_id?: number | null;
          permit_id?: number | null;
          updated?: string | null;
        };
        Update: {
          amount?: number;
          created?: string;
          id?: number;
          location_id?: number | null;
          permit_id?: number | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credits_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credits_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credits_permit_id_fkey";
            columns: ["permit_id"];
            isOneToOne: false;
            referencedRelation: "permits";
            referencedColumns: ["id"];
          },
        ];
      };
      debits: {
        Row: {
          amount: number;
          created: string;
          id: number;
          location_id: number | null;
          token_id: number | null;
          updated: string | null;
        };
        Insert: {
          amount: number;
          created?: string;
          id?: number;
          location_id?: number | null;
          token_id?: number | null;
          updated?: string | null;
        };
        Update: {
          amount?: number;
          created?: string;
          id?: number;
          location_id?: number | null;
          token_id?: number | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "debits_token_id_fkey";
            columns: ["token_id"];
            isOneToOne: false;
            referencedRelation: "tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_debits_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_debits_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      issue_comments: {
        Row: {
          author_id: string;
          created_at: string;
          embedding: string;
          id: string;
          issue_id: string | null;
          markdown: string | null;
          modified_at: string;
          payload: Json | null;
          plaintext: string | null;
        };
        Insert: {
          author_id: string;
          created_at?: string;
          embedding: string;
          id: string;
          issue_id?: string | null;
          markdown?: string | null;
          modified_at?: string;
          payload?: Json | null;
          plaintext?: string | null;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          embedding?: string;
          id?: string;
          issue_id?: string | null;
          markdown?: string | null;
          modified_at?: string;
          payload?: Json | null;
          plaintext?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "issue_comments_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      issues: {
        Row: {
          author_id: string;
          created_at: string;
          embedding: string;
          id: string;
          markdown: string | null;
          modified_at: string;
          payload: Json | null;
          plaintext: string | null;
        };
        Insert: {
          author_id: string;
          created_at?: string;
          embedding: string;
          id: string;
          markdown?: string | null;
          modified_at?: string;
          payload?: Json | null;
          plaintext?: string | null;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          embedding?: string;
          id?: string;
          markdown?: string | null;
          modified_at?: string;
          payload?: Json | null;
          plaintext?: string | null;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          authorized: boolean | null;
          created: string;
          id: number;
          label_from: string | null;
          label_to: string | null;
          location_id: number | null;
          updated: string | null;
        };
        Insert: {
          authorized?: boolean | null;
          created?: string;
          id?: number;
          label_from?: string | null;
          label_to?: string | null;
          location_id?: number | null;
          updated?: string | null;
        };
        Update: {
          authorized?: boolean | null;
          created?: string;
          id?: number;
          label_from?: string | null;
          label_to?: string | null;
          location_id?: number | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "labels_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "labels_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          comment_id: number | null;
          created: string;
          id: number;
          issue_id: number | null;
          node_id: string | null;
          node_type: string | null;
          node_url: string | null;
          organization_id: number | null;
          repository_id: number | null;
          updated: string | null;
          user_id: number | null;
        };
        Insert: {
          comment_id?: number | null;
          created?: string;
          id?: number;
          issue_id?: number | null;
          node_id?: string | null;
          node_type?: string | null;
          node_url?: string | null;
          organization_id?: number | null;
          repository_id?: number | null;
          updated?: string | null;
          user_id?: number | null;
        };
        Update: {
          comment_id?: number | null;
          created?: string;
          id?: number;
          issue_id?: number | null;
          node_id?: string | null;
          node_type?: string | null;
          node_url?: string | null;
          organization_id?: number | null;
          repository_id?: number | null;
          updated?: string | null;
          user_id?: number | null;
        };
        Relationships: [];
      };
      logs: {
        Row: {
          created: string;
          id: number;
          level: string | null;
          location_id: number | null;
          log: string;
          metadata: Json | null;
          updated: string | null;
        };
        Insert: {
          created?: string;
          id?: number;
          level?: string | null;
          location_id?: number | null;
          log: string;
          metadata?: Json | null;
          updated?: string | null;
        };
        Update: {
          created?: string;
          id?: number;
          level?: string | null;
          location_id?: number | null;
          log?: string;
          metadata?: Json | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_logs_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_logs_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      partners: {
        Row: {
          created: string;
          id: number;
          location_id: number | null;
          updated: string | null;
          wallet_id: number | null;
        };
        Insert: {
          created?: string;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
          wallet_id?: number | null;
        };
        Update: {
          created?: string;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
          wallet_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_partners_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_partners_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partners_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: true;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      permits: {
        Row: {
          amount: string;
          beneficiary_id: number;
          created: string;
          deadline: string;
          id: number;
          location_id: number | null;
          nonce: string;
          partner_id: number | null;
          signature: string;
          token_id: number | null;
          invalidation: string | null;
          transaction: string | null;
          updated: string | null;
        };
        Insert: {
          amount: string;
          beneficiary_id: number;
          created?: string;
          deadline: string;
          id?: number;
          location_id?: number | null;
          nonce: string;
          partner_id?: number | null;
          signature: string;
          token_id?: number | null;
          invalidation?: string | null;
          transaction?: string | null;
          updated?: string | null;
        };
        Update: {
          amount?: string;
          beneficiary_id?: number;
          created?: string;
          deadline?: string;
          id?: number;
          location_id?: number | null;
          nonce?: string;
          partner_id?: number | null;
          signature?: string;
          token_id?: number | null;
          invalidation?: string | null;
          transaction?: string | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_permits_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_permits_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permits_beneficiary_id_fkey";
            columns: ["beneficiary_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permits_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "partners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permits_token_fkey";
            columns: ["token_id"];
            isOneToOne: false;
            referencedRelation: "tokens";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          created: string;
          credit_id: number | null;
          debit_id: number | null;
          id: number;
          location_id: number | null;
          updated: string | null;
          user_id: number;
        };
        Insert: {
          created?: string;
          credit_id?: number | null;
          debit_id?: number | null;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
          user_id: number;
        };
        Update: {
          created?: string;
          credit_id?: number | null;
          debit_id?: number | null;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fk_settlements_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_settlements_location";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_credit_id_fkey";
            columns: ["credit_id"];
            isOneToOne: false;
            referencedRelation: "credits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_debit_id_fkey";
            columns: ["debit_id"];
            isOneToOne: false;
            referencedRelation: "debits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      tokens: {
        Row: {
          address: string;
          created: string;
          id: number;
          location_id: number | null;
          network: number;
          updated: string | null;
        };
        Insert: {
          address: string;
          created?: string;
          id?: number;
          location_id?: number | null;
          network?: number;
          updated?: string | null;
        };
        Update: {
          address?: string;
          created?: string;
          id?: number;
          location_id?: number | null;
          network?: number;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tokens_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tokens_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created: string;
          id: number;
          location_id: number | null;
          updated: string | null;
          wallet_id: number | null;
        };
        Insert: {
          created?: string;
          id: number;
          location_id?: number | null;
          updated?: string | null;
          wallet_id?: number | null;
        };
        Update: {
          created?: string;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
          wallet_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "users_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "users_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      wallets: {
        Row: {
          address: string | null;
          created: string;
          id: number;
          location_id: number | null;
          updated: string | null;
        };
        Insert: {
          address?: string | null;
          created?: string;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
        };
        Update: {
          address?: string | null;
          created?: string;
          id?: number;
          location_id?: number | null;
          updated?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wallets_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "issues_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallets_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      issues_view: {
        Row: {
          comment_id: number | null;
          created: string | null;
          id: number | null;
          issue_id: number | null;
          node_id: string | null;
          node_type: string | null;
          node_url: string | null;
          organization_id: number | null;
          repository_id: number | null;
          updated: string | null;
          user_id: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      find_similar_issues: {
        Args: {
          current_id: string;
          query_embedding: string;
          threshold: number;
          top_k: number;
        };
        Returns: {
          issue_id: string;
          issue_plaintext: string;
          similarity: number;
        }[];
      };
      insert_with_exception_handling: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      read_secret: {
        Args: {
          secret_name: string;
        };
        Returns: string;
      };
    };
    Enums: {
      github_node_type:
        | "App"
        | "Bot"
        | "CheckRun"
        | "CheckSuite"
        | "ClosedEvent"
        | "CodeOfConduct"
        | "Commit"
        | "CommitComment"
        | "CommitContributionsByRepository"
        | "ContributingGuidelines"
        | "ConvertToDraftEvent"
        | "CreatedCommitContribution"
        | "CreatedIssueContribution"
        | "CreatedPullRequestContribution"
        | "CreatedPullRequestReviewContribution"
        | "CreatedRepositoryContribution"
        | "CrossReferencedEvent"
        | "Discussion"
        | "DiscussionComment"
        | "Enterprise"
        | "EnterpriseUserAccount"
        | "FundingLink"
        | "Gist"
        | "Issue"
        | "IssueComment"
        | "JoinedGitHubContribution"
        | "Label"
        | "License"
        | "Mannequin"
        | "MarketplaceCategory"
        | "MarketplaceListing"
        | "MergeQueue"
        | "MergedEvent"
        | "MigrationSource"
        | "Milestone"
        | "Organization"
        | "PackageFile"
        | "Project"
        | "ProjectCard"
        | "ProjectColumn"
        | "ProjectV2"
        | "PullRequest"
        | "PullRequestCommit"
        | "PullRequestReview"
        | "PullRequestReviewComment"
        | "ReadyForReviewEvent"
        | "Release"
        | "ReleaseAsset"
        | "Repository"
        | "RepositoryContactLink"
        | "RepositoryTopic"
        | "RestrictedContribution"
        | "ReviewDismissedEvent"
        | "SecurityAdvisoryReference"
        | "SocialAccount"
        | "SponsorsListing"
        | "Team"
        | "TeamDiscussion"
        | "TeamDiscussionComment"
        | "User"
        | "Workflow"
        | "WorkflowRun"
        | "WorkflowRunFile";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"]) | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] & Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] & Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database } ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"] : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database } ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"] : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema["Enums"] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database } ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"] : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"] | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
