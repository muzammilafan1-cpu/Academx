import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class CreatePostScreen extends StatefulWidget {
  const CreatePostScreen({super.key});

  @override
  State<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends State<CreatePostScreen> {

  final TextEditingController titleController = TextEditingController();
  final TextEditingController descriptionController = TextEditingController();

  bool loading = false;

  Future<void> publishPost() async {

    if (titleController.text.trim().isEmpty ||
        descriptionController.text.trim().isEmpty) {
      return;
    }

    setState(() {
      loading = true;
    });

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final userData = userDoc.data();

    if (userData == null) return;
    final institutionId = userData["institutionId"];

    await FirebaseFirestore.instance.collection('posts').add({
      "title": titleController.text.trim(),
      "description": descriptionController.text.trim(),
      "institutionId": institutionId,
      "createdBy": user.uid,
      "createdByName": userData["name"],
      "createdByRole": userData["role"],
      "createdAt": FieldValue.serverTimestamp(),
    });

    await FirebaseFirestore.instance.collection('alerts').add({
      "title": "New Announcement",
      "message": titleController.text.trim(),
      "institutionId": institutionId,
      "createdAt": FieldValue.serverTimestamp(),
      "source": "posts",
      "referenceId": "",
      "read": false,
      "targetRoles": ["student","teacher","admin","superadmin"]
    });

    if (!mounted) return;

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(

      appBar: AppBar(
        title: const Text("Create Announcement"),
      ),

      body: Padding(
        padding: const EdgeInsets.all(20),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            const Text(
              "Title",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: titleController,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: "Enter announcement title",
              ),
            ),

            const SizedBox(height: 20),

            const Text(
              "Description",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: descriptionController,
              maxLines: 6,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: "Write your announcement",
              ),
            ),

            const Spacer(),

            SizedBox(
              width: double.infinity,
              height: 50,

              child: ElevatedButton(

                onPressed: loading ? null : publishPost,

                child: loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Publish Announcement"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}