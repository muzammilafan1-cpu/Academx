import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AccountActivationScreen extends StatefulWidget {
  const AccountActivationScreen({super.key});

  @override
  State<AccountActivationScreen> createState() =>
      _AccountActivationScreenState();
}

class _AccountActivationScreenState
    extends State<AccountActivationScreen> {
  final TextEditingController emailController =
  TextEditingController();

  bool isLoading = false;

  // True once a request has been sent. The message is the same
  // whether or not the email is enrolled.
  bool requested = false;

  // Must match the region of the Cloud Functions (see functions/index.js).
  static const String _functionsRegion = 'asia-south1';

  static const String _genericMessage =
      "If your email is eligible, we'll send you an "
      'account activation link.';

  // ------------------------------------------------------------
  // SEND ACTIVATION LINK
  //
  // 1. A Cloud Function checks (server-side) whether this email
  //    belongs to an approved student and prepares the account.
  //    It never tells us the answer.
  // 2. We then ask Firebase to send the password-setup email.
  //    The student chooses their own password from that email.
  // ------------------------------------------------------------

  Future<void> sendActivationLink() async {
    final email = emailController.text.trim().toLowerCase();

    if (email.isEmpty) {
      _showMessage('Please enter your registered email.');
      return;
    }

    if (!email.contains('@') || !email.contains('.')) {
      _showMessage('Please enter a valid email address.');
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      final callable = FirebaseFunctions.instanceFor(
        region: _functionsRegion,
      ).httpsCallable('activateStudentAccount');

      final result = await callable.call(<String, dynamic>{
        'email': email,
      });

      final data = Map<String, dynamic>.from(
        (result.data as Map?) ?? <String, dynamic>{},
      );

      // Too many requests for this email in a short time.
      if (data['proceed'] == false) {
        _showMessage(
          'Please wait a minute before trying again.',
        );
        return;
      }

      try {
        await FirebaseAuth.instance.sendPasswordResetEmail(
          email: email,
        );
      } on FirebaseAuthException catch (e) {
        if (e.code == 'invalid-email') {
          _showMessage('Please enter a valid email address.');
          return;
        }
        // Any other result (including "user not found") is
        // deliberately ignored so we never reveal who is enrolled.
      }

      if (!mounted) return;

      setState(() {
        requested = true;
      });

      _showMessage(_genericMessage);
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'invalid-argument') {
        _showMessage('Please enter a valid email address.');
      } else {
        _showMessage('Something went wrong. Please try again.');
      }
    } catch (e) {
      _showMessage('Something went wrong. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  // ------------------------------------------------------------
  // MESSAGE
  // ------------------------------------------------------------

  void _showMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  // ------------------------------------------------------------
  // DISPOSE
  // ------------------------------------------------------------

  @override
  void dispose() {
    emailController.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black87,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            Navigator.pop(context);
          },
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 32,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: 420,
              ),
              child: _buildActivationContent(),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // ACTIVATION CONTENT
  // ------------------------------------------------------------

  Widget _buildActivationContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(),

        const SizedBox(height: 40),

        _buildEmailField(),

        const SizedBox(height: 28),

        _buildContinueButton(),

        const SizedBox(height: 24),

        _buildInformation(),
      ],
    );
  }

  // ------------------------------------------------------------
  // HEADER
  // ------------------------------------------------------------

  Widget _buildHeader() {
    return const Column(
      children: [
        Text(
          'Activate your account',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
        SizedBox(height: 10),
        Text(
          'Enter the email registered with your institution.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14,
            color: Colors.black54,
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // EMAIL FIELD
  // ------------------------------------------------------------

  Widget _buildEmailField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Email',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          autocorrect: false,
          onSubmitted: (_) {
            if (!isLoading) {
              sendActivationLink();
            }
          },
          decoration: InputDecoration(
            hintText: 'Enter your registered email',
            prefixIcon: const Icon(
              Icons.email_outlined,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: Color(0xFFE0E0E0),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: Color(0xFF1565C0),
                width: 1.5,
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------
  // CONTINUE BUTTON
  // ------------------------------------------------------------

  Widget _buildContinueButton() {
    return SizedBox(
      height: 54,
      child: ElevatedButton(
        onPressed: isLoading
            ? null
            : sendActivationLink,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1565C0),
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: isLoading
            ? const SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor:
            AlwaysStoppedAnimation<Color>(
              Colors.white,
            ),
          ),
        )
            : const Text(
          'Continue',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // INFORMATION
  // ------------------------------------------------------------

  Widget _buildInformation() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            requested
                ? Icons.mark_email_read_outlined
                : Icons.info_outline,
            size: 20,
            color: const Color(0xFF1565C0),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              requested
                  ? "$_genericMessage Check your inbox "
                  '(and spam folder), open the link and choose '
                  'your password. Then come back and sign in.'
                  : 'Use the email address provided to your '
                  'institution. If your account is eligible, '
                  'Academx will send an activation link to '
                  'that email.',
              style: const TextStyle(
                fontSize: 13,
                height: 1.4,
                color: Colors.black54,
              ),
            ),
          ),
        ],
      ),
    );
  }
}